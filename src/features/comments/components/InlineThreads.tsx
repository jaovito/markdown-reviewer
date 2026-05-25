import {
  findThreadByCommentId,
  remoteThreadsKey,
  showMutationError,
  useRemoteThreads,
} from "@/features/sync";
import { ipc } from "@/shared/ipc/client";
import type {
  CommentAnchor,
  CommentUpdate,
  RefreshResult,
  ReviewComment,
} from "@/shared/ipc/contract";
import { minimizedKey, useMinimizedThreads } from "@/shared/stores/useMinimizedThreads";
import { useSelectedThread } from "@/shared/stores/useSelectedThread";
import { type FilterableState, useThreadsFilter } from "@/shared/stores/useThreadsFilter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type CommentGroup,
  anchorEndLine,
  anchorStartLine,
  groupCommentsByStartLine,
} from "../lib/groupAnchors";
import { CommentComposer } from "./CommentComposer";
import { HiddenThreadMarker } from "./HiddenThreadMarker";
import { InlineThreadCard } from "./InlineThreadCard";
import { MinimizedThreadBadge } from "./MinimizedThreadBadge";
import { RangeHeaderChip } from "./RangeHeaderChip";
import { ResolvedThreadMarker } from "./ResolvedThreadMarker";

interface InlineThreadsProps {
  /**
   * Absolute repo path — only required for syncing resolve / reopen with
   * GitHub on `submitted` comments. When absent, those actions stay local.
   */
  repoPath?: string;
  prNumber: number;
  filePath: string;
  headSha: string;
  comments: ReviewComment[];
  containerRef: React.RefObject<HTMLElement | null>;
  /** When set, renders an inline draft composer at this anchor's start line. */
  composerAnchor: CommentAnchor | null;
  onComposerClose: () => void;
}

/** Composite key `${startLine}:${endLine}` so two threads sharing a startLine
 *  but with different end lines render in distinct slots. */
type SlotKey = string;

function slotKeyFor(startLine: number, endLine: number): SlotKey {
  return `${startLine}:${endLine}`;
}

interface SlotMap {
  /** key → portal target div for the expanded card */
  threads: Map<SlotKey, HTMLDivElement>;
  /** key → portal target span for the minimized "open" badge */
  badges: Map<SlotKey, HTMLSpanElement>;
  /** key → portal target div for the sticky range header (multi-line ranges only) */
  headers: Map<SlotKey, HTMLDivElement>;
  composerSlot: HTMLDivElement | null;
}

/**
 * Mounts thread cards (and the optional draft composer) inline in the document
 * flow as siblings of the corresponding `[data-source-line]` element. Uses
 * direct DOM injection + React portals so commented lines visibly push later
 * content down — matching the design's "Comment under the line" layout.
 */
export function InlineThreads({
  repoPath,
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
  // `useMinimizedThreads` still drives the multi-comment "expand stack" badge
  // (#21). The persistent `Hide` button no longer touches this store — it
  // updates `state = hidden` via IPC instead (see Issue #22).
  const minimizedSet = useMinimizedThreads((s) => s.minimized);
  const expand = useMinimizedThreads((s) => s.expand);
  const paneFilter = useThreadsFilter((s) => s.filter);
  const ensurePaneVisible = useThreadsFilter((s) => s.ensureVisible);
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

  const remove = useMutation({
    mutationFn: (id: number) =>
      ipc.comments.delete(id).then((r) => {
        if (!r.ok) throw r.error;
        return r.value;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comments", prNumber] });
      queryClient.invalidateQueries({ queryKey: ["local-comments", prNumber, filePath] });
    },
  });

  // Mounted with the same key as `AppHeader`/`ThreadsPane`, so React Query
  // dedupes and we read whatever the most recent refresh stored. `refresh()`
  // is only called as a fallback when a submitted comment has no remote twin
  // in cache yet (e.g. the user just clicked "Finish review" and the cache
  // hasn't been warmed since).
  const remote = useRemoteThreads({ repoPath, prNumber, headSha });

  // When the user resolves or reopens a `submitted` comment from the inline
  // card, propagate the action to GitHub. The local state is always written
  // first (the existing `update.mutate` call) so the UI feedback is instant;
  // any GitHub failure surfaces via `showMutationError` without rolling the
  // local state back — the next refresh will reconcile.
  const syncStateToRemote = useCallback(
    async (comment: ReviewComment, next: "resolved" | "reopen") => {
      if (comment.githubId === null) return;
      if (!repoPath || prNumber === undefined) return;
      try {
        let cache = queryClient.getQueryData<RefreshResult | null>(
          remoteThreadsKey(repoPath, prNumber),
        );
        let thread = findThreadByCommentId(cache ?? null, comment.githubId);
        if (!thread) {
          const refreshed = await remote.refresh();
          thread = findThreadByCommentId(refreshed, comment.githubId);
          cache = refreshed;
        }
        if (!thread) {
          showMutationError(
            new Error(
              "Couldn't find the GitHub thread for this comment. Try clicking Refresh and resolve again.",
            ),
          );
          return;
        }
        const result =
          next === "resolved"
            ? await ipc.sync.resolve(repoPath, thread.threadId)
            : await ipc.sync.reopen(repoPath, thread.threadId);
        if (!result.ok) throw result.error;
        // Patch the cached remote thread so the right-pane GitHub-threads
        // card reflects the new state without a second round-trip.
        queryClient.setQueryData<RefreshResult | null>(
          remoteThreadsKey(repoPath, prNumber),
          (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              threads: prev.threads.map((t) =>
                t.threadId === result.value.threadId ? result.value : t,
              ),
            };
          },
        );
      } catch (err) {
        showMutationError(err);
      }
    },
    [queryClient, remote, repoPath, prNumber],
  );

  // Memoize groups directly from `comments` — the previous fingerprint missed
  // anchor end-line / kind changes, which left portals pointing at stale
  // slots when an anchor moved. React Query already returns a stable array
  // identity until the underlying data changes, so this re-runs precisely
  // when needed.
  const groups = useMemo(() => groupCommentsByStartLine(comments), [comments]);

  const composerStart = composerAnchor ? anchorStartLine(composerAnchor) : null;
  const composerEnd = composerAnchor
    ? Math.max(composerStart ?? 0, anchorEndLine(composerAnchor))
    : null;

  // The minimized store is global and keyed by (prNumber, filePath, start,
  // end). The slot Maps inside this component are per-instance and keyed by
  // (start, end) only. Project the global state down to a local slot-key set
  // so `syncSlots` can keep using the simple comparison.
  const localMinimized = useMemo(() => {
    const out = new Set<SlotKey>();
    for (const g of groups) {
      const k = minimizedKey(prNumber, filePath, g.startLine, g.endLine);
      if (minimizedSet.has(k)) out.add(slotKeyFor(g.startLine, g.endLine));
    }
    return out;
  }, [groups, minimizedSet, prNumber, filePath]);

  // Groups whose every (non-deleted) comment is in the `hidden` state — the
  // inline preview renders only a discreet gutter marker for these so the
  // document content stays the focus, while the comment row itself still
  // exists and shows up in the pane when the user enables the `hidden` chip.
  const allHiddenSet = useMemo(() => {
    const out = new Set<SlotKey>();
    for (const g of groups) {
      if (g.comments.length > 0 && g.comments.every((c) => c.state === "hidden")) {
        out.add(slotKeyFor(g.startLine, g.endLine));
      }
    }
    return out;
  }, [groups]);

  // Resolved threads also collapse to a (different, more muted) gutter marker
  // — but only when the thread isn't the currently selected one. Clicking the
  // marker selects the head, which flips this set and re-mounts the full card.
  // Hidden takes precedence over resolved if both somehow apply (e.g. mixed
  // states won't reach here, but a fully-hidden thread that was previously
  // resolved should still render as Hidden, not Resolved).
  const resolvedCollapsed = useMemo(() => {
    const out = new Set<SlotKey>();
    for (const g of groups) {
      const slotKey = slotKeyFor(g.startLine, g.endLine);
      if (allHiddenSet.has(slotKey)) continue;
      const allResolved = g.comments.every((c) => c.state === "resolved");
      if (!allResolved) continue;
      const isSelected = g.comments.some((c) => c.id === selectedId);
      if (isSelected) continue;
      out.add(slotKey);
    }
    return out;
  }, [groups, allHiddenSet, selectedId]);

  // Slot allocation collapses every "show a badge instead of the card" case
  // (minimized, all-hidden, all-resolved-and-unselected) into one set — the
  // underlying DOM machinery treats them the same. The distinction is
  // restored when picking which React component to portal into the badge
  // slot below.
  const collapsedSet = useMemo(() => {
    const out = new Set<SlotKey>(localMinimized);
    for (const k of allHiddenSet) out.add(k);
    for (const k of resolvedCollapsed) out.add(k);
    return out;
  }, [localMinimized, allHiddenSet, resolvedCollapsed]);

  // Slot map lives in a ref; we only bump `revision` when the slot identities
  // actually change so the React tree re-renders the portals minimally.
  const slotsRef = useRef<SlotMap>({
    threads: new Map(),
    badges: new Map(),
    headers: new Map(),
    composerSlot: null,
  });
  const [, setRevision] = useState(0);
  // Tracks whether the current DOM mutation batch was caused by our own slot
  // injections (so the MutationObserver below ignores it).
  const mutatingRef = useRef(false);

  // One-shot highlight ring on the line(s) of a thread the user just expanded
  // from its resolved gutter marker. Cleared after ~1.5s so the document goes
  // back to its normal look. `prefers-reduced-motion` is honored in the
  // companion CSS rule (the keyframe is suppressed there).
  const [flashKey, setFlashKey] = useState<SlotKey | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerFlash = useCallback((key: SlotKey) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlashKey(key);
    flashTimeoutRef.current = setTimeout(() => {
      setFlashKey(null);
      flashTimeoutRef.current = null;
    }, 1500);
  }, []);
  useEffect(
    () => () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    },
    [],
  );

  // Translate the flash slot key back into a (start, end) range for syncSlots
  // to stamp on the right line nodes.
  const flashRange = useMemo<{ start: number; end: number } | null>(() => {
    if (!flashKey) return null;
    const match = groups.find((g) => slotKeyFor(g.startLine, g.endLine) === flashKey);
    if (!match) return null;
    return { start: match.startLine, end: match.endLine };
  }, [flashKey, groups]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const changed = syncSlots(
      container,
      slotsRef.current,
      groups,
      collapsedSet,
      composerStart,
      composerEnd,
      flashRange,
      mutatingRef,
    );
    if (changed) setRevision((r) => r + 1);
    // NOTE: do NOT tear down all slots here on dep change. `syncSlots` is
    // already incremental — when a single anchor flips from card to badge
    // (or vice versa) it only mutates that one anchor's slots, leaving
    // every other slot (including the draft `CommentComposer` slot) in
    // place. A destructive cleanup on every render would unmount the
    // composer's portal target whenever the user clicks a resolved thread
    // marker (or any selection change that toggles `collapsedSet`),
    // wiping the unsaved body text in `CommentComposer`'s local state.
    // Final teardown lives in the unmount-only effect below.
  }, [containerRef, groups, collapsedSet, composerStart, composerEnd, flashRange]);

  // One-shot cleanup, tied only to the `containerRef`. React invokes this
  // cleanup when the article element is swapped (different file rendered)
  // or when `InlineThreads` itself unmounts — never on a routine state
  // change. Keeps the slot DOM stable across selection / collapse flips
  // so portals (and the composer's local body state) survive.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return () => {
      mutatingRef.current = true;
      try {
        removeAllSlots(container);
        slotsRef.current = {
          threads: new Map(),
          badges: new Map(),
          headers: new Map(),
          composerSlot: null,
        };
      } finally {
        queueMicrotask(() => {
          mutatingRef.current = false;
        });
      }
    };
  }, [containerRef]);

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
        collapsedSet,
        composerStart,
        composerEnd,
        flashRange,
        mutatingRef,
      );
      if (changed) setRevision((r) => r + 1);
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef, groups, collapsedSet, composerStart, composerEnd, flashRange]);

  const slots = slotsRef.current;

  return (
    <>
      {groups.flatMap((group) => {
        const slotKey = slotKeyFor(group.startLine, group.endLine);
        const minKey = minimizedKey(prNumber, filePath, group.startLine, group.endLine);
        const minimized = minimizedSet.has(minKey);
        const allHidden = allHiddenSet.has(slotKey);
        const isResolvedCollapsedEarly = resolvedCollapsed.has(slotKey);
        const headerSlot = slots.headers.get(slotKey);
        const wantsHeader =
          group.startLine !== group.endLine &&
          !minimized &&
          !allHidden &&
          !isResolvedCollapsedEarly;
        const headerNode =
          wantsHeader && headerSlot
            ? createPortal(
                <RangeHeaderChip
                  key={`hdr-${slotKey}`}
                  startLine={group.startLine}
                  endLine={group.endLine}
                  count={group.comments.length}
                  state={group.comments[0]?.state ?? "submitted"}
                  onJump={() => {
                    const head = group.comments[0];
                    if (head) select(head.id);
                    const cardSlot = slotsRef.current.threads.get(slotKey);
                    if (cardSlot) {
                      const reduce =
                        typeof window !== "undefined" &&
                        typeof window.matchMedia === "function" &&
                        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                      cardSlot.scrollIntoView({
                        block: "center",
                        behavior: reduce ? "auto" : "smooth",
                      });
                    }
                  }}
                />,
                headerSlot,
                `thread-header-${slotKey}`,
              )
            : null;

        const isSelected = group.comments.some((c) => c.id === selectedId);
        const isResolvedCollapsed = resolvedCollapsed.has(slotKey);
        let body: React.ReactNode = null;
        if (allHidden) {
          // `Hidden` is a persistent comment state, not the session-only
          // minimize toggle — render a discreet `MessageSquareOff` marker in
          // the gutter instead of the full card. Clicking it unhides every
          // comment in the group: rows with a `githubId` go back to
          // `submitted`, otherwise to `draft`. The Rust transition table
          // (`Hidden → Draft | Submitted | Resolved | Deleted`) allows both.
          const badgeSlot = slots.badges.get(slotKey);
          body = badgeSlot
            ? createPortal(
                <HiddenThreadMarker
                  key={slotKey}
                  count={group.comments.length}
                  onUnhide={() => {
                    for (const c of group.comments) {
                      update.mutate({ id: c.id, patch: { state: targetUnhideState(c) } });
                    }
                    const head = group.comments[0];
                    if (head) select(head.id);
                  }}
                />,
                badgeSlot,
                `thread-hidden-${slotKey}`,
              )
            : null;
        } else if (minimized) {
          const badgeSlot = slots.badges.get(slotKey);
          body = badgeSlot
            ? createPortal(
                <MinimizedThreadBadge
                  key={slotKey}
                  count={group.comments.length}
                  onExpand={() => {
                    expand(minKey);
                    const head = group.comments[0];
                    if (head) select(head.id);
                  }}
                />,
                badgeSlot,
                `thread-badge-${slotKey}`,
              )
            : null;
        } else if (isResolvedCollapsed) {
          const badgeSlot = slots.badges.get(slotKey);
          body = badgeSlot
            ? createPortal(
                <ResolvedThreadMarker
                  key={slotKey}
                  count={group.comments.length}
                  onExpand={() => {
                    const head = group.comments[0];
                    if (head) select(head.id);
                    triggerFlash(slotKey);
                  }}
                />,
                badgeSlot,
                `thread-resolved-marker-${slotKey}`,
              )
            : null;
        } else {
          const slot = slots.threads.get(slotKey);
          body = slot
            ? createPortal(
                <InlineThreadCard
                  key={slotKey}
                  comments={group.comments}
                  selected={isSelected}
                  onResolve={(c) => {
                    select(c.id);
                    update.mutate({ id: c.id, patch: { state: "resolved" } });
                    void syncStateToRemote(c, "resolved");
                  }}
                  onReopen={(c) => {
                    select(c.id);
                    update.mutate({ id: c.id, patch: { state: "submitted" } });
                    void syncStateToRemote(c, "reopen");
                  }}
                  // `Hide` persists `state = hidden` via IPC so the choice survives
                  // restart and a remote refresh. The session-only `minimize` store
                  // still drives the count-badge expand UX (see #21) but it is no
                  // longer wired to this button.
                  onHide={(c) => {
                    select(c.id);
                    update.mutate({ id: c.id, patch: { state: "hidden" } });
                  }}
                  onUnhide={(c) => {
                    select(c.id);
                    update.mutate({ id: c.id, patch: { state: targetUnhideState(c) } });
                  }}
                  onReply={(c) => select(c.id)}
                  onDelete={(c) => remove.mutate(c.id)}
                  onShowStack={(c) => {
                    const target = pickPaneVisibleComment(group.comments, paneFilter, c);
                    // If every comment in the group is filtered out of the pane,
                    // flip on the chip for the head's state so the pane shows it.
                    if (!isPaneVisible(target, paneFilter)) {
                      ensurePaneVisible(target.state as FilterableState);
                    }
                    select(target.id);
                  }}
                />,
                slot,
                `thread-${slotKey}`,
              )
            : null;
        }
        return [headerNode, body];
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

/**
 * Picks the unhide target for a comment. Submitted comments came back from
 * the remote (have a `githubId`) so they go back to `submitted`; locally
 * authored ones never hit GitHub yet, so they go back to `draft`. Both
 * transitions are allowed by `CommentState::can_transition_to`.
 */
function targetUnhideState(comment: ReviewComment): "submitted" | "draft" {
  return comment.githubId !== null ? "submitted" : "draft";
}

/**
 * Returns true when the comment's state is currently shown in the threads
 * pane filter. `deleted` comments are never shown.
 */
function isPaneVisible(
  comment: ReviewComment,
  paneFilter: Record<FilterableState, boolean>,
): boolean {
  if (comment.state === "deleted") return false;
  return paneFilter[comment.state] === true;
}

/**
 * Picks a comment from the group that the threads pane is *currently* showing.
 * Falls back to `fallback` (usually the head) when every comment in the group
 * is filtered out — the caller can then flip the matching chip on so the
 * selection becomes reachable in the pane.
 */
function pickPaneVisibleComment(
  comments: ReviewComment[],
  paneFilter: Record<FilterableState, boolean>,
  fallback: ReviewComment,
): ReviewComment {
  return comments.find((c) => isPaneVisible(c, paneFilter)) ?? fallback;
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
  // Observer is configured `{ childList: true, subtree: true }` only — no
  // attribute mutations reach this callback, so any record with no
  // significant added/removed nodes is by definition irrelevant.
  return false;
}

/**
 * Reconciles the DOM slots under each commented line and the optional draft
 * composer slot. Mutates the article in place. Returns `true` when the slot
 * identity map changed (callers re-render to update portal targets).
 *
 * `collapsed` covers both user-minimized threads (Hide) and resolved threads
 * that are auto-collapsed to the gutter marker. The DOM treats them
 * identically — a single badge slot under the anchor line — and only the
 * React portal layer differentiates the two visuals.
 */
function syncSlots(
  container: HTMLElement,
  current: SlotMap,
  groups: CommentGroup[],
  collapsed: Set<SlotKey>,
  composerStart: number | null,
  composerEnd: number | null,
  flashRange: { start: number; end: number } | null,
  mutatingRef: { current: boolean },
): boolean {
  mutatingRef.current = true;
  try {
    let changed = false;

    // Collect every source line we may need to attach against. Lazy code-block
    // splitting only touches `<pre>` blocks that actually intersect at least
    // one commented or composer-pending line — keeps the DOM small for
    // documents with lots of unrelated code blocks.
    const wantedLines = new Set<number>();
    for (const g of groups) {
      for (let l = g.startLine; l <= g.endLine; l++) wantedLines.add(l);
      wantedLines.add(g.attachLine);
    }
    if (composerStart !== null && composerEnd !== null) {
      for (let l = composerStart; l <= composerEnd; l++) wantedLines.add(l);
    }
    splitCodeBlocks(container, wantedLines);

    // A group needs a card slot ONLY when it isn't collapsed; otherwise it
    // needs a badge slot inside the line element.
    const wantsCard = new Set<SlotKey>();
    const wantsBadge = new Set<SlotKey>();
    for (const g of groups) {
      const key = slotKeyFor(g.startLine, g.endLine);
      if (collapsed.has(key)) wantsBadge.add(key);
      else wantsCard.add(key);
    }

    const lineNodes = nearestLineNodes(container);

    // 1a. Remove obsolete card slots (lines no longer commented or now
    //     minimized).
    for (const [key, node] of current.threads) {
      if (!wantsCard.has(key) || !node.isConnected) {
        node.remove();
        current.threads.delete(key);
        changed = true;
      }
    }

    // 1b. Remove obsolete badge slots (lines no longer commented or now
    //     expanded).
    for (const [key, node] of current.badges) {
      if (!wantsBadge.has(key) || !node.isConnected) {
        node.remove();
        current.badges.delete(key);
        changed = true;
      }
    }

    // 1c. Remove obsolete header slots — only multi-line non-collapsed groups
    //     keep one.
    const wantsHeaderKeys = new Set<SlotKey>();
    for (const g of groups) {
      if (g.startLine === g.endLine) continue;
      const key = slotKeyFor(g.startLine, g.endLine);
      if (collapsed.has(key)) continue;
      wantsHeaderKeys.add(key);
    }
    for (const [key, node] of current.headers) {
      if (!wantsHeaderKeys.has(key) || !node.isConnected) {
        node.remove();
        current.headers.delete(key);
        changed = true;
      }
    }

    // 2. Remove obsolete composer slot.
    if (
      current.composerSlot &&
      (composerEnd === null ||
        !current.composerSlot.isConnected ||
        Number(current.composerSlot.dataset.threadSlotLine ?? "0") !== composerEnd)
    ) {
      current.composerSlot.remove();
      current.composerSlot = null;
      changed = true;
    }

    // 3. Clear and reapply the data-has-comment attribute on commented lines.
    for (const n of container.querySelectorAll<HTMLElement>("[data-has-comment]")) {
      delete n.dataset.hasComment;
    }
    for (const n of container.querySelectorAll<HTMLElement>("[data-comment-range]")) {
      delete n.dataset.commentRange;
    }
    for (const n of container.querySelectorAll<HTMLElement>("[data-comment-minimized]")) {
      delete n.dataset.commentMinimized;
    }
    for (const n of container.querySelectorAll<HTMLElement>("[data-comment-resolved]")) {
      delete n.dataset.commentResolved;
    }
    for (const n of container.querySelectorAll<HTMLElement>("[data-comment-flash]")) {
      delete n.dataset.commentFlash;
    }

    // 4. Insert missing slots and tag every commented line in the range.
    //    Card slot mounts AFTER `attachLine` (== endLine) so the expanded
    //    card sits below the last highlighted row. Badge slot mounts INSIDE
    //    `attachLine` as a trailing inline element on that line.
    for (const group of groups) {
      const key = slotKeyFor(group.startLine, group.endLine);
      const isCollapsed = collapsed.has(key);
      const allResolved = group.comments.every((c) => c.state === "resolved");
      markRange(lineNodes, group.startLine, group.endLine, isCollapsed, allResolved);
      const anchor = lineNodes.get(group.attachLine);
      if (!anchor) continue;
      if (isCollapsed) {
        if (current.badges.has(key)) continue;
        const badge = document.createElement("span");
        badge.dataset.threadBadge = "true";
        badge.dataset.threadSlotLine = String(group.line);
        anchor.appendChild(badge);
        current.badges.set(key, badge);
        changed = true;
      } else {
        if (!current.threads.has(key)) {
          if (!anchor.parentNode) continue;
          const slot = document.createElement("div");
          slot.dataset.threadSlot = "thread";
          slot.dataset.threadSlotLine = String(group.line);
          anchor.parentNode.insertBefore(slot, anchor.nextSibling);
          current.threads.set(key, slot);
          changed = true;
        }
        // Multi-line ranges also get a sticky header chip mounted before the
        // start-line node. Single-line ranges keep the existing wash only.
        if (group.startLine !== group.endLine && !current.headers.has(key)) {
          const startNode = lineNodes.get(group.startLine);
          if (startNode?.parentNode) {
            const header = document.createElement("div");
            header.dataset.threadSlot = "header";
            header.dataset.threadSlotLine = String(group.startLine);
            startNode.parentNode.insertBefore(header, startNode);
            current.headers.set(key, header);
            changed = true;
          }
        }
      }
    }

    // 4b. Stamp the temporary flash attribute so the CSS animation paints
    //     the highlight ring on the user's freshly-expanded thread.
    if (flashRange) {
      for (let line = flashRange.start; line <= flashRange.end; line++) {
        const el = lineNodes.get(line);
        if (!el) continue;
        el.dataset.commentFlash = "true";
      }
    }

    // 5. Insert the composer slot if needed.
    if (composerStart !== null && composerEnd !== null) {
      markRange(lineNodes, composerStart, composerEnd, false, false);
      if (!current.composerSlot) {
        const anchor = lineNodes.get(composerEnd);
        if (anchor?.parentNode) {
          const slot = document.createElement("div");
          slot.dataset.threadSlot = "composer";
          slot.dataset.threadSlotLine = String(composerEnd);
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
 * `collapsed` is true, also stamps `data-comment-minimized="true"` so the
 * highlight CSS can render a softer background. `resolved` adds an extra
 * `data-comment-resolved="true"` flag so the CSS can mute the strip even
 * further for resolved threads regardless of why they collapsed.
 */
function markRange(
  lineNodes: Map<number, HTMLElement>,
  start: number,
  end: number,
  collapsed: boolean,
  resolved: boolean,
) {
  const single = start === end;
  for (let line = start; line <= end; line++) {
    const el = lineNodes.get(line);
    if (!el) continue;
    el.dataset.hasComment = "true";
    el.dataset.commentRange = single
      ? "single"
      : line === start
        ? "head"
        : line === end
          ? "tail"
          : "body";
    if (collapsed) el.dataset.commentMinimized = "true";
    if (resolved) el.dataset.commentResolved = "true";
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
  for (const n of container.querySelectorAll<HTMLElement>("[data-comment-range]")) {
    delete n.dataset.commentRange;
  }
  for (const n of container.querySelectorAll<HTMLElement>("[data-comment-minimized]")) {
    delete n.dataset.commentMinimized;
  }
  for (const n of container.querySelectorAll<HTMLElement>("[data-comment-resolved]")) {
    delete n.dataset.commentResolved;
  }
  for (const n of container.querySelectorAll<HTMLElement>("[data-comment-flash]")) {
    delete n.dataset.commentFlash;
  }
}

/**
 * Splits each code block whose lines intersect `wantedLines` into one
 * `<span data-code-line data-source-line=N>` per line so the highlight CSS
 * (and slot-injection logic) can target individual lines instead of the
 * whole block. Handles both shapes remark-rehype may produce — the
 * `data-source-line` attribute can sit on the `<pre>` OR on its inner
 * `<code>`. Idempotent. We skip code blocks the user hasn't commented on
 * to avoid blowing up the DOM in code-heavy documents.
 */
function splitCodeBlocks(container: HTMLElement, wantedLines: Set<number>) {
  if (wantedLines.size === 0) return;
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
    const lineCount = text.split("\n").length;
    // Only split when at least one of this block's lines was requested.
    let intersects = false;
    for (let i = 0; i < lineCount; i++) {
      if (wantedLines.has(fenceLine + 1 + i)) {
        intersects = true;
        break;
      }
    }
    if (!intersects) continue;

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
