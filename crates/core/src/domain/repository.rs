use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub path: String,
    pub remote_url: String,
    pub owner: String,
    pub repo: String,
    pub current_branch: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteUrl {
    pub raw: String,
    pub owner: String,
    pub repo: String,
}

impl RemoteUrl {
    pub fn parse_github(raw: &str) -> Option<Self> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }

        // SSH: git@github.com:owner/repo(.git)?
        if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
            return extract(rest).map(|(owner, repo)| Self {
                raw: trimmed.to_string(),
                owner,
                repo,
            });
        }

        // HTTPS: https://github.com/owner/repo(.git)?
        // Also accepts http:// and git:// forms.
        for prefix in [
            "https://github.com/",
            "http://github.com/",
            "git://github.com/",
            "ssh://git@github.com/",
        ] {
            if let Some(rest) = trimmed.strip_prefix(prefix) {
                return extract(rest).map(|(owner, repo)| Self {
                    raw: trimmed.to_string(),
                    owner,
                    repo,
                });
            }
        }

        None
    }
}

fn extract(rest: &str) -> Option<(String, String)> {
    let rest = rest.trim_end_matches('/');
    let mut parts = rest.splitn(3, '/');
    let owner = parts.next()?.to_string();
    let repo_raw = parts.next()?;
    let repo = repo_raw.trim_end_matches(".git").to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ssh_url() {
        let r = RemoteUrl::parse_github("git@github.com:weqora/markdown-reviewer.git").unwrap();
        assert_eq!(r.owner, "weqora");
        assert_eq!(r.repo, "markdown-reviewer");
    }

    #[test]
    fn parses_https_url() {
        let r = RemoteUrl::parse_github("https://github.com/foo/bar").unwrap();
        assert_eq!(r.owner, "foo");
        assert_eq!(r.repo, "bar");
    }

    #[test]
    fn rejects_non_github() {
        assert!(RemoteUrl::parse_github("git@gitlab.com:foo/bar.git").is_none());
    }
}
