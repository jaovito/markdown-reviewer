//! Serves repository assets (images referenced from Markdown) to the `WebView`
//! over a custom URI scheme.
//!
//! Parameters travel as a query string rather than a path because custom-scheme
//! host and path handling differs across platforms — Windows in particular
//! serves custom schemes over `http://<scheme>.localhost` and mangles
//! `mdasset://<host>` forms.
//!
//! This is not a filesystem read primitive. Every read goes through
//! `read_repo_asset`, which resolves via `git show <sha>:<path>` or the GitHub
//! Contents API; both resolve inside a tree object, so a traversal like
//! `../../etc/passwd` resolves to nothing rather than to a file.

use markdown_reviewer_core::application::files::read_repo_asset;
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

/// Pulls `repo`, `sha`, and `path` out of the request URI's query string.
fn params(uri: &str) -> Option<(String, String, String)> {
    let query = uri.split_once('?')?.1;
    let (mut repo, mut sha, mut path) = (None, None, None);
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=')?;
        match k {
            "repo" => repo = decode(v),
            "sha" => sha = decode(v),
            "path" => path = decode(v),
            _ => {}
        }
    }
    Some((repo?, sha?, path?))
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

        let files = { app.state::<AppState>().files.clone() };

        match read_repo_asset(&files, &repo_path, &sha, &file_path).await {
            Ok(bytes) => {
                let response = Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", mime_for(&file_path))
                    .header("Cache-Control", "max-age=3600")
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
