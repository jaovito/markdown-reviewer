//! Serves repository assets (images referenced from Markdown) to the `WebView`
//! over a custom URI scheme.
//!
//! Parameters travel as a query string rather than a path because custom-scheme
//! host and path handling differs across platforms — Windows in particular
//! serves custom schemes over `http://<scheme>.localhost` and mangles
//! `mdasset://<host>` forms.
//!
//! This is not a filesystem-traversal-capable primitive: `path` resolves via
//! `read_repo_asset`, through `git show <sha>:<path>` or the GitHub Contents
//! API, both inside a git tree object, so `../../etc/passwd` resolves to
//! nothing there. That alone is not sufficient, though — `git show` also
//! accepts flag-shaped arguments (e.g. `--output=<file>`) anywhere it expects
//! a revision, which lets a crafted `sha` turn a read into a write. This
//! handler additionally: rejects any `sha` that isn't a plausible
//! abbreviated-or-full hex object name before it reaches a subprocess argv
//! (`is_plausible_sha`); relies on `infra::git::git_cli` passing
//! `--end-of-options` to `git show` as defense in depth; and only serves
//! assets for a `repo` that matches a known recent repository
//! (`repo_is_known`), so the scheme can't be pointed at an arbitrary
//! directory on disk.

use markdown_reviewer_core::application::files::read_repo_asset;
use markdown_reviewer_core::ports::RecentRepository;
use markdown_reviewer_ipc::AppState;
use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

pub(crate) const SCHEME: &str = "mdasset";

/// Maps a file extension to a MIME type. Deliberately a short allowlist: an
/// unknown extension gets `application/octet-stream`, which the `WebView`
/// will refuse to render as an image — a visible failure, not a silent one.
fn mime_for(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// Percent-decodes a query parameter value.
fn decode(raw: &str) -> Option<String> {
    let bytes = raw.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                out.push(u8::from_str_radix(hex, 16).ok()?);
                i += 3;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

/// Pulls `repo`, `sha`, and `path` out of the request URI's query string. A
/// pair without `=` is skipped rather than failing the whole parse, so an
/// unrelated or valueless query parameter doesn't take the well-formed ones
/// down with it.
fn params(uri: &str) -> Option<(String, String, String)> {
    let query = uri.split_once('?')?.1;
    let (mut repo, mut sha, mut path) = (None, None, None);
    for pair in query.split('&') {
        let Some((k, v)) = pair.split_once('=') else {
            continue;
        };
        match k {
            "repo" => repo = decode(v),
            "sha" => sha = decode(v),
            "path" => path = decode(v),
            _ => {}
        }
    }
    Some((repo?, sha?, path?))
}

/// `git show` treats a revision argument starting with `-`/`--` as an option
/// rather than a revision — e.g. `--output=<file>`, which writes `<file>`
/// instead of reading anything. Restricting `sha` to a plausible
/// abbreviated-or-full hex object name closes that off before the value
/// reaches a subprocess argv; nothing else is ever a valid revision here,
/// since every caller passes a commit SHA. `infra::git::git_cli` also passes
/// `--end-of-options` to `git show` as defense in depth.
fn is_plausible_sha(sha: &str) -> bool {
    (7..=40).contains(&sha.len()) && sha.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Whether `repo_path` matches a repository the user has actually opened
/// through the app's own repo-selection flow. Without this, `mdasset://`
/// could read any git repository reachable on disk, not just the one the
/// document under review belongs to.
fn repo_is_known(recents: &[RecentRepository], repo_path: &str) -> bool {
    recents.iter().any(|r| r.path == repo_path)
}

fn error(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("build error response")
}

pub(crate) fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let uri = request.uri().to_string();

    tauri::async_runtime::spawn(async move {
        let Some((repo_path, sha, file_path)) = params(&uri) else {
            tracing::warn!("mdasset: malformed request URI");
            responder.respond(error(StatusCode::BAD_REQUEST));
            return;
        };

        if !is_plausible_sha(&sha) {
            tracing::warn!(sha = %sha, "mdasset: rejected a non-hex sha");
            responder.respond(error(StatusCode::BAD_REQUEST));
            return;
        }

        // Scoped so the `State` borrow doesn't need to live across an await.
        let (recents, files) = {
            let Some(state) = app.try_state::<AppState>() else {
                tracing::warn!("mdasset: AppState not yet managed");
                responder.respond(error(StatusCode::SERVICE_UNAVAILABLE));
                return;
            };
            (state.repo_selection.recents.clone(), state.files.clone())
        };

        let recents_list = match recents.list().await {
            Ok(list) => list,
            Err(e) => {
                tracing::debug!(error = ?e, "mdasset: recents lookup failed");
                Vec::new()
            }
        };
        if !repo_is_known(&recents_list, &repo_path) {
            tracing::warn!("mdasset: rejected a repo outside the known recents");
            responder.respond(error(StatusCode::NOT_FOUND));
            return;
        }

        match read_repo_asset(&files, &repo_path, &sha, &file_path).await {
            Ok(bytes) => {
                let response = Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", mime_for(&file_path))
                    .header("Cache-Control", "max-age=3600")
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Content-Security-Policy", "default-src 'none'")
                    .body(bytes)
                    .expect("build asset response");
                responder.respond(response);
            }
            Err(e) => {
                // Path is logged, content never is.
                tracing::debug!(path = %file_path, error = ?e, "mdasset: asset unavailable");
                responder.respond(error(StatusCode::NOT_FOUND));
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_handles_percent_encoding() {
        assert_eq!(decode("docs%2Fa.png").as_deref(), Some("docs/a.png"));
        assert_eq!(decode("50%25").as_deref(), Some("50%"));
    }

    #[test]
    fn decode_treats_literal_plus_as_space_and_encoded_plus_as_plus() {
        // `URLSearchParams` form-encodes space as `+`; `encodeURIComponent`
        // never emits a literal `+` and encodes space as `%20` instead. Both
        // conventions must round-trip through the same decoder.
        assert_eq!(decode("a+b").as_deref(), Some("a b"));
        assert_eq!(decode("a%20b").as_deref(), Some("a b"));
        assert_eq!(decode("a%2Bb").as_deref(), Some("a+b"));
    }

    #[test]
    fn decode_round_trips_multi_byte_utf8() {
        // `é` is `%C3%A9` under both `encodeURIComponent` and
        // `URLSearchParams`; the two bytes must reassemble into one `char`.
        assert_eq!(decode("caf%C3%A9.png").as_deref(), Some("café.png"));
    }

    #[test]
    fn decode_fails_closed_on_malformed_input() {
        assert_eq!(decode("%zz"), None); // invalid hex digits
        assert_eq!(decode("%FF"), None); // valid hex, not valid standalone UTF-8
    }

    #[test]
    fn decode_passes_a_dangling_percent_through_literally() {
        // A `%` with fewer than two hex digits after it can't be decoded
        // into a byte, so it's kept as-is rather than treated as an error —
        // there's nothing to smuggle through an escape that never completes.
        assert_eq!(decode("100%").as_deref(), Some("100%"));
    }

    #[test]
    fn params_extracts_all_three_and_ignores_unknown_keys() {
        let uri = "mdasset://localhost/?repo=%2Frepo&sha=HEAD&path=a.png&bogus=1";
        assert_eq!(
            params(uri),
            Some(("/repo".into(), "HEAD".into(), "a.png".into()))
        );
    }

    #[test]
    fn params_tolerates_a_valueless_pair_around_the_real_ones() {
        let uri = "mdasset://localhost/?flag&repo=%2Frepo&sha=HEAD&path=a.png";
        assert_eq!(
            params(uri),
            Some(("/repo".into(), "HEAD".into(), "a.png".into()))
        );
    }

    #[test]
    fn params_fails_without_a_query_string() {
        assert_eq!(params("mdasset://localhost/"), None);
    }

    #[test]
    fn params_fails_when_a_required_key_is_missing() {
        assert_eq!(params("mdasset://localhost/?repo=%2Frepo&sha=HEAD"), None);
    }

    #[test]
    fn is_plausible_sha_accepts_abbreviated_and_full_hex() {
        assert!(is_plausible_sha("a1b2c3d"));
        assert!(is_plausible_sha(&"a".repeat(40)));
        assert!(is_plausible_sha("DEADBEEF"));
    }

    #[test]
    fn is_plausible_sha_rejects_the_reported_argv_injection_string() {
        assert!(!is_plausible_sha("--output=/tmp/pwned"));
        assert!(!is_plausible_sha("-x"));
    }

    #[test]
    fn is_plausible_sha_rejects_wrong_length_and_non_hex_chars() {
        assert!(!is_plausible_sha("abc")); // too short
        assert!(!is_plausible_sha(&"a".repeat(41))); // too long
        assert!(!is_plausible_sha("HEAD")); // not hex
        assert!(!is_plausible_sha("g1b2c3d")); // 'g' isn't hex
    }

    fn recent(path: &str) -> RecentRepository {
        RecentRepository {
            path: path.to_string(),
            label: "label".into(),
            remote_url: None,
            owner: None,
            repo: None,
            last_opened_at: 0,
            pinned: false,
        }
    }

    #[test]
    fn repo_is_known_matches_an_exact_path_only() {
        let recents = vec![recent("/repos/foo")];
        assert!(repo_is_known(&recents, "/repos/foo"));
        assert!(!repo_is_known(&recents, "/repos/bar"));
        assert!(!repo_is_known(&[], "/repos/foo"));
    }
}
