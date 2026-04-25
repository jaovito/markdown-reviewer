import { ipc } from "@/shared/ipc/client";
import type { CommentAnchor, CommentUpdate, ReviewComment } from "@/shared/ipc/contract";
import { useMinimizedThreads } from "@/shared/stores/useMinimizedThreads";
import { useSelectedThread } from "@/shared/stores/useSelectedThread";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type CommentGroup,
  anchorEndLine,
  anchorStartLine,
  groupCommentsByStartLine,
} from "../lib/groupAnchors";
import { CommentComposer } from "./CommentComposer";
import { InlineThreadCard } from "./InlineThreadCard";
import { MinimizedThreadBadge } from "./MinimizedThreadBadge";

interface InlineThreadsProps {
  prNumber: number;
  filePath: string;
  headSha: string;
  comments: ReviewComment[];
  containerRef: React.RefObject<HTMLElement | null>;
  /** When set, renders an inline draft composer at this anchor's start line. */
  composerAnchor: CommentAnchor | null;
  onComposerClose: () => void;
}

interface SlotMap {
  /** sourceLine → portal target div for the expanded card */
  threads: Map<number, HTMLDivElement>;
  /** sourceLine → portal target span for the minimized "open" badge */
  badges: Map<number, HTMLSpanElement>;
  composerSlot: HTMLDivElement | null;
}

/**
 * Mounts thread cards (and the optional draft composer) inline in the document
 * flow as siblings of the corresponding `[data-source-line]` element. Uses
 * direct DOM injection + React portals so commented lines visibly push later
 * content down — matching the design's "Comment under the line" layout.
 */
export function InlineThreads({
  prNumber,
  filePath,
  headSha,
  comments,
  containerRef,
  composerAnchor,
  onComposerClose,
}: InlineThreadsProps) {
  const select = useSelectedThread((s) => s.select);
  const selectedId = useSelectedThread((s) => s.selectedCommentId);
  const minimizedSet = useMinimizedThreads((s) => s.minimized);
  const minimize = useMinimizedThreads((s) => s.minimize);
  const expand = useMinimizedThreads((s) => s.expand);
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: CommentUpdate }) =>
      ipc.comments.update(id, patch).then((r) => {
        if (!r.ok) throw r.error;
        return r.value;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comments", prNumber] });
      queryClient.invalidateQueries({ queryKey: ["local-comments", prNumber, filePath] });
    },
  });

  // Memoize groups so identity is stable across renders unless comments
  // actually change. We compute a fingerprint and use that to gate the memo.
  const groupsKey = useMemo(
    () =>
      comments
        .map((c) => `${c.id}:${c.state}:${anchorStart(c)}`)
        .sort()
        .join("|"),
    [comments],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: groupsKey is the stable fingerprint.
  const groups = useMemo(() => groupCommentsByStartLine(comments), [groupsKey]);

  const composerStart = composerAnchor ? anchorStartLine(composerAnchor) : null;
  const composerEnd = composerAnchor
    ? Math.max(composerStart ?? 0, anchorEndLine(composerAnchor))
    : null;

  // Slot map lives in a ref; we only bump `revision` when the slot identities
  // actually change so the React tree re-renders the portals minimally.
  const slotsRef = useRef<SlotMap>({
    threads: new Map(),
    badges: new Map(),
    composerSlot: null,
  });
  const [, setRevision] = useState(0);
  // Tracks whether the current DOM mutation batch was caused by our own slot
  // injections (so the MutationObserver below ignores it).
  const mutatingRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const changed = syncSlots(
      container,
      slotsRef.current,
      groups,
      minimizedSet,
      composerStart,
      composerEnd,
      mutatingRef,
    );
    if (changed) setRevision((r) => r + 1);
    return () => {
      mutatingRef.current = true;
      try {
        removeAllSlots(container);
        slotsRef.current = { threads: new Map(), badges: new Map(), composerSlot: null };
      } finally {
        // Allow the observer to see post-cleanup state.
        queueMicrotask(() => {
          mutatingRef.current = false;
        });
      }
    };
  }, [containerRef, groups, minimizedSet, composerStart, composerEnd]);

  // Re-sync when the rendered article DOM changes (a markdown re-render).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new MutationObserver((records) => {
      if (mutatingRef.current) return;
      // If every mutation involves only slot/has-comment nodes we did
      // ourselves, skip — our own mutations shouldn't trigger a re-sync.
      const significant = records.some((r) => mutationIsSignificant(r));
      if (!significant) return;
      const changed = syncSlots(
        container,
        slotsRef.current,
        groups,
        minimizedSet,
        composerStart,
        composerEnd,
        mutatingRef,
      );
      if (changed) setRevision((r) => r + 1);
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef, groups, minimizedSet, composerStart, composerEnd]);

  const slots = slotsRef.current;

  return (
    <>
      {groups.map((group) => {
        const minimized = minimizedSet.has(group.line);
        if (minimized) {
          const badgeSlot = slots.badges.get(group.line);
          if (!badgeSlot) return null;
          return createPortal(
            <MinimizedThreadBadge
              key={group.line}
              count={group.comments.length}
              onExpand={() => {
                expand(group.line);
                const head = group.comments[0];
                if (head) select(head.id);
              }}
            />,
            badgeSlot,
            `thread-badge-${group.line}`,
          );
        }
        const slot = slots.threads.get(group.line);
        if (!slot) return null;
        const isSelected = group.comments.some((c) => c.id === selectedId);
        return createPortal(
          <InlineThreadCard
            key={group.line}
            comments={group.comments}
            selected={isSelected}
            onResolve={(c) => {
              select(c.id);
              update.mutate({ id: c.id, patch: { state: "resolved" } });
            }}
            onHide={() => minimize(group.line)}
            onReply={(c) => select(c.id)}
          />,
          slot,
          `thread-${group.line}`,
        );
      })}
      {composerAnchor && slots.composerSlot
        ? createPortal(
            <div className="my-3">
              <CommentComposer
                prNumber={prNumber}
                filePath={filePath}
                headSha={headSha}
                anchor={composerAnchor}
                onClose={onComposerClose}
              />
            </div>,
            slots.composerSlot,
            "draft-composer",
          )
        : null}
    </>
  );
}

function anchorStart(c: ReviewComment): number {
  return c.anchor.kind === "singleLine" ? c.anchor.line : c.anchor.startLine;
}

function mutationIsSignificant(record: MutationRecord): boolean {
  const all = [...record.addedNodes, ...record.removedNodes];
  for (const node of all) {
    if (!(node instanceof HTMLElement)) return true;
    // Our own DOM injections — slot wrappers, per-line code spans, badge
    // slots — are self-inflicted; ignore them.
    if (node.dataset.threadSlot) continue;
    if (node.dataset.threadBadge) continue;
    if (node.dataset.codeLine) continue;
    return true;
  }
  // Pure attribute changes on the line nodes (data-has-comment /
  // data-comment-minimized) are also self-inflicted — our toggles trigger them.
  if (record.type === "attributes") {
    if (record.attributeName === "data-has-comment") return false;
    if (record.attributeName === "data-comment-minimized") return false;
  }
  return false;
}

/**
 * Reconciles the DOM slots under each commented line and the optional draft
 * composer slot. Mutates the article in place. Returns `true` when the slot
 * identity map changed (callers re-render to update portal targets).
 */
function syncSlots(
  container: HTMLElement,
  current: SlotMap,
  groups: CommentGroup[],
  minimized: Set<number>,
  composerStart: number | null,
  composerEnd: number | null,
  mutatingRef: { current: boolean },
): boolean {
  mutatingRef.current = true;
  try {
    let changed = false;

    // Per-line splitting for code blocks must happen before we look up
    // anchors so each commented line has its own DOM element (and the
    // `[data-has-comment]` highlight CSS targets just that line).
    splitCodeBlocks(container);

    // A group needs a card slot ONLY when it isn't minimized; otherwise it
    // needs a badge slot inside the line element.
    const wantsCard = new Set<number>();
    const wantsBadge = new Set<number>();
    for (const g of groups) {
      if (minimized.has(g.line)) wantsBadge.add(g.line);
      else wantsCard.add(g.line);
    }

    const lineNodes = nearestLineNodes(container);

    // 1a. Remove obsolete card slots (lines no longer commented or now
    //     minimized).
    for (const [line, node] of current.threads) {
      if (!wantsCard.has(line) || !node.isConnected) {
        node.remove();
        current.threads.delete(line);
        changed = true;
      }
    }

    // 1b. Remove obsolete badge slots (lines no longer commented or now
    //     expanded).
    for (const [line, node] of current.badges) {
      if (!wantsBadge.has(line) || !node.isConnected) {
        node.remove();
        current.badges.delete(line);
        changed = true;
      }
    }

    // 2. Remove obsolete composer slot.
    if (
      current.composerSlot &&
      (composerEnd === null ||
        !current.composerSlot.isConnected ||
        Number(current.composerSlot.dataset.sourceLine ?? "0") !== composerEnd)
    ) {
      current.composerSlot.remove();
      current.composerSlot = null;
      changed = true;
    }

    // 3. Clear and reapply the data-has-comment attribute on commented lines.
    for (const n of container.querySelectorAll<HTMLElement>("[data-has-comment]")) {
      delete n.dataset.hasComment;
    }
    for (const n of container.querySelectorAll<HTMLElement>("[data-comment-minimized]")) {
      delete n.dataset.commentMinimized;
    }

    // 4. Insert missing slots and tag every commented line in the range.
    //    Card slot mounts AFTER `attachLine` (== endLine) so the expanded
    //    card sits below the last highlighted row. Badge slot mounts INSIDE
    //    `attachLine` as a trailing inline element on that line.
    for (const group of groups) {
      const isMinimized = minimized.has(group.line);
      markRange(lineNodes, group.startLine, group.endLine, isMinimized);
      const anchor = lineNodes.get(group.attachLine);
      if (!anchor) continue;
      if (isMinimized) {
        if (current.badges.has(group.line)) continue;
        const badge = document.createElement("span");
        badge.dataset.threadBadge = "true";
        badge.dataset.sourceLine = String(group.line);
        anchor.appendChild(badge);
        current.badges.set(group.line, badge);
        changed = true;
      } else {
        if (current.threads.has(group.line)) continue;
        if (!anchor.parentNode) continue;
        const slot = document.createElement("div");
        slot.dataset.threadSlot = "thread";
        slot.dataset.sourceLine = String(group.line);
        anchor.parentNode.insertBefore(slot, anchor.nextSibling);
        current.threads.set(group.line, slot);
        changed = true;
      }
    }

    // 5. Insert the composer slot if needed.
    if (composerStart !== null && composerEnd !== null) {
      markRange(lineNodes, composerStart, composerEnd, false);
      if (!current.composerSlot) {
        const anchor = lineNodes.get(composerEnd);
        if (anchor?.parentNode) {
          const slot = document.createElement("div");
          slot.dataset.threadSlot = "composer";
          slot.dataset.sourceLine = String(composerEnd);
          anchor.parentNode.insertBefore(slot, anchor.nextSibling);
          current.composerSlot = slot;
          changed = true;
        }
      }
    }

    return changed;
  } finally {
    queueMicrotask(() => {
      mutatingRef.current = false;
    });
  }
}

/**
 * Tags every line in `[start, end]` that has a rendered DOM element. When
 * `minimized` is true, also stamps `data-comment-minimized="true"` so the
 * highlight CSS can render a softer background.
 */
function markRange(
  lineNodes: Map<number, HTMLElement>,
  start: number,
  end: number,
  minimized: boolean,
) {
  for (let line = start; line <= end; line++) {
    const el = lineNodes.get(line);
    if (!el) continue;
    el.dataset.hasComment = "true";
    if (minimized) el.dataset.commentMinimized = "true";
  }
}

function removeAllSlots(container: HTMLElement) {
  for (const node of container.querySelectorAll("[data-thread-slot]")) {
    node.remove();
  }
  for (const node of container.querySelectorAll("[data-thread-badge]")) {
    node.remove();
  }
  for (const n of container.querySelectorAll<HTMLElement>("[data-has-comment]")) {
    delete n.dataset.hasComment;
  }
  for (const n of container.querySelectorAll<HTMLElement>("[data-comment-minimized]")) {
    delete n.dataset.commentMinimized;
  }
}

/**
 * Walks every code block and breaks its content into one
 * `<span data-code-line data-source-line=N>` per line so the highlight CSS
 * (and slot-injection logic) can target individual lines instead of the
 * whole block. Handles both shapes remark-rehype may produce — the
 * `data-source-line` attribute can sit on the `<pre>` OR on its inner
 * `<code>`. Idempotent.
 */
function splitCodeBlocks(container: HTMLElement) {
  const seen = new WeakSet<HTMLElement>();
  const candidates = container.querySelectorAll<HTMLElement>(
    "pre[data-source-line], pre > code[data-source-line]",
  );
  for (const node of candidates) {
    const pre = (node.tagName === "PRE" ? node : node.parentElement) as HTMLElement | null;
    if (!pre) continue;
    if (seen.has(pre)) continue;
    seen.add(pre);
    if (pre.querySelector(":scope [data-code-line]")) continue;

    const fenceLineRaw = node.dataset.sourceLine ?? pre.dataset.sourceLine ?? "";
    const fenceLine = Number(fenceLineRaw);
    if (!Number.isFinite(fenceLine) || fenceLine <= 0) continue;

    const code = pre.querySelector(":scope > code") as HTMLElement | null;
    const host = code ?? pre;
    const text = host.textContent ?? "";
    if (text.length === 0) continue;

    // Drop the trailing newline (markdown always emits one) so we don't add
    // an empty span the user can't visibly select.
    const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text;
    const lines = trimmed.split("\n");

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < lines.length; i++) {
      const span = document.createElement("span");
      span.dataset.codeLine = "true";
      // Fence opener is `fenceLine`; first content line is `fenceLine + 1`.
      span.dataset.sourceLine = String(fenceLine + 1 + i);
      span.textContent = `${lines[i] ?? ""}\n`;
      fragment.appendChild(span);
    }
    host.replaceChildren(fragment);

    // Strip `data-source-line` from the pre / code so they can't shadow our
    // per-line spans in `nearestLineNodes` (first-occurrence-wins traversal),
    // and — crucially — so the `[data-source-line][data-has-comment]` CSS
    // rule never paints the whole block by accident.
    delete pre.dataset.sourceLine;
    if (code) delete code.dataset.sourceLine;
  }
}

/**
 * Maps each rendered source-line to the most specific (deepest) DOM element
 * that carries that line. Container blocks like `<ul>`, `<ol>`, `<blockquote>`
 * inherit `data-source-line` from their first child, so naively picking the
 * first-occurrence highlights the whole container — we walk descendants and
 * keep replacing whenever the new candidate is contained by the previous one.
 */
function nearestLineNodes(container: HTMLElement): Map<number, HTMLElement> {
  const out = new Map<number, HTMLElement>();
  const nodes = container.querySelectorAll<HTMLElement>("[data-source-line]");
  for (const node of nodes) {
    const line = Number(node.dataset.sourceLine ?? "0");
    if (!Number.isFinite(line) || line <= 0) continue;
    const existing = out.get(line);
    if (!existing || existing.contains(node)) {
      out.set(line, node);
    }
  }
  return out;
}
