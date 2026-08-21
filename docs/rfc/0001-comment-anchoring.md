# RFC 0001 — Comment Anchoring

- **Status:** Accepted (after review on 2026-04-22)
- **Author:** @jaovito
- **Reviewers:** @ana, @lucas, @diego
- **Created:** 2026-04-12 · **Last updated:** 2026-04-24
- **Target milestone:** Phase 3 — Local Comments

## Summary

Comments in Markdown Reviewer must remain visually anchored to the snippet
they reference, even after the underlying file changes between PR pushes.
This RFC proposes a hybrid anchoring strategy combining a **stable AST
fingerprint** with a **soft positional fallback**.

## Motivation

GitHub anchors review comments to a `(path, line)` tuple. If the author
force-pushes or rewrites the diff, comments drift to "outdated" and lose
their visual home. We want a Google-Docs-like experience where:

- The comment stays glued to its sentence even if the paragraph moves.
- A clear "stale" indicator shows when we can no longer locate the anchor.
- The original line is still recoverable (so we can call back to GitHub's
  legacy positional API on submit).

## Goals / Non-goals

| | |
|---|---|
| ✅ Survive paragraph reordering | ❌ Survive full rewrites of the snippet |
| ✅ Round-trip with GitHub's `position` field | ❌ Real-time CRDT collaboration |
| ✅ Fully local-first | ❌ Server-side anchor service |

## Proposal

We compute, per comment, a **triple anchor**:

```ts
type CommentAnchor = {
  // 1. AST fingerprint: stable across whitespace edits
  fingerprint: string; // sha256 of normalized mdast subtree

  // 2. Soft anchor: textual N-gram for fuzzy fallback
  trigram: string;

  // 3. Hard anchor: original line range, used only on submit
  originalRange: { start: number; end: number };
};
```

On every render pass we walk the [mdast](https://github.com/syntax-tree/mdast)
tree, compute the fingerprint of each addressable node, and rebuild a map
`fingerprint -> DOMRange`. Comments locate their anchor by:

1. Exact fingerprint match → ✅ anchored.
2. Trigram match within ±20 lines of `originalRange` → ⚠️ "moved".
3. Otherwise → 🚫 "stale", surfaced via a dedicated tray.

### Flow

```mermaid
flowchart TD
    A[User selects snippet] --> B[Compute mdast subtree]
    B --> C[Generate fingerprint + trigram]
    C --> D[Persist to SQLite drafts]
    D --> E{Re-render}
    E -->|Fingerprint hit| F[Anchor to DOM range]
    E -->|Trigram hit| G[Anchor + show 'moved' badge]
    E -->|No hit| H[Move to stale tray]
    F --> I[Submit to GitHub on review]
    G --> I
    H --> J[User reattaches manually]
```

### Fingerprint normalization

```rust
// crates/anchoring/src/fingerprint.rs
pub fn fingerprint(node: &mdast::Node) -> String {
    let mut h = Sha256::new();
    walk(node, &mut |n| match n {
        mdast::Node::Text(t) => h.update(t.value.trim().to_lowercase()),
        mdast::Node::Code(c) => {
            h.update(c.lang.as_deref().unwrap_or(""));
            h.update(&c.value);
        }
        mdast::Node::Heading(h2) => h.update(format!("h{}", h2.depth)),
        _ => h.update(node_kind(n)),
    });
    hex::encode(h.finalize())
}
```

## Trade-offs

| Approach | Pros | Cons |
|---|---|---|
| Pure positional | Simple, matches GitHub | Breaks on every rebase |
| Pure AST hash | Stable across reformats | Drifts on small text edits |
| **Hybrid (this RFC)** | Best of both | Two indexes to maintain |

## Open questions

- [x] ~~Should trigram fallback be opt-in per repo?~~ **Resolved
      2026-04-22:** always on; cost is negligible after the worker
      move (see [rendering guide](../guides/markdown-rendering.md#performance)).
- [x] ~~How do we display the "moved" badge?~~ **Resolved:** dashed
      amber border on the gutter strip, plus tooltip on hover.
- [ ] What's the cost of recomputing fingerprints on every keystroke during
      draft authoring? We need a benchmark.
- [ ] (new, raised by @diego) Do we re-anchor on every PR refresh, or
      only when `head_sha` advances? Leaning toward the latter to avoid
      flicker. Decision needed before Phase 3 freeze.

## Performance budget

After @ana flagged that recomputation could lag on large docs, we
agreed the following numbers as a hard ceiling:

| Doc size | Fingerprint pass | Trigram index |
|---|---|---|
| ≤ 50 KB | ≤ 8 ms | ≤ 5 ms |
| ≤ 200 KB | ≤ 35 ms | ≤ 20 ms |
| > 200 KB | warn + run in worker | run in worker |

These numbers are enforced by the bench in
`crates/anchoring/benches/fingerprint.rs`.

## Demo

![comment anchoring prototype](../assets/anchoring-demo.gif)

> _Prototype recorded against `superset/docs/intro.md` on 2026-04-10._
