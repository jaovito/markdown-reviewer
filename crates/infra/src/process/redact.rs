/// Strips common token shapes (`ghp_*`, `gho_*`, `ghu_*`, `ghs_*`, `ghr_*`,
/// `github_pat_*`, bare 40-char hex) from any string we log.
pub fn redact(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut buf = String::new();

    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            buf.push(ch);
        } else {
            flush(&mut buf, &mut out);
            out.push(ch);
        }
    }
    flush(&mut buf, &mut out);
    out
}

fn flush(buf: &mut String, out: &mut String) {
    if buf.is_empty() {
        return;
    }
    if looks_like_token(buf) {
        out.push_str("[REDACTED]");
    } else {
        out.push_str(buf);
    }
    buf.clear();
}

fn looks_like_token(s: &str) -> bool {
    const GH_PREFIXES: &[&str] = &["ghp_", "gho_", "ghu_", "ghs_", "ghr_"];
    if GH_PREFIXES.iter().any(|p| s.starts_with(p)) && s.len() >= 20 {
        return true;
    }
    if s.starts_with("github_pat_") && s.len() >= 20 {
        return true;
    }
    if s.len() == 40 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_classic_pat() {
        let out = redact("token=ghp_abcdefghijklmnopqrstuvwxyz");
        assert!(out.contains("[REDACTED]"));
    }

    #[test]
    fn leaves_normal_text_alone() {
        let s = "git version 2.43.0";
        assert_eq!(redact(s), s);
    }
}
