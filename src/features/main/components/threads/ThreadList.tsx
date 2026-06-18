import { ipc } from "@/shared/ipc/client";
import type { CommentUpdate, ReviewComment } from "@/shared/ipc/contract";
import { useSelectedThread } from "@/shared/stores/useSelectedThread";
import { Skeleton } from "@/shared/ui/skeleton";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigateToComment } from "../../lib/navigateToComment";
import { ThreadAnchorGroup } from "./ThreadAnchorGroup";
import { ThreadCard, type ThreadGroup } from "./ThreadCard";
import { ThreadFileGroup } from "./ThreadFileGroup";

interface ThreadListProps {
  comments: ReviewComment[];
  isLoading: boolean;
  hideFilePath: boolean;
  hiddenCount: number;
  /** PR number, used to invalidate the comments queries after a Reopen. */
  prNumber?: number;
  /** File path of the currently open preview, when one is selected. */
  currentFilePath?: string;
  /** Repo absolute path — forwarded to ThreadCard for the snippet read. */
  repoPath?: string;
  /** PR head sha — forwarded to ThreadCard for the snippet cache key. */
  sha?: string;
}

/**
 * One entry in the flat list of focusable tree items. Headers (file / anchor)
 * are interleaved with leaf cards so a single roving-tabindex cursor can walk
 * across the full hierarchy. Cards collapsed under a closed group are simply
 * absent from this list.
 */
type NavItem =
  | { kind: "file"; id: string; filePath: string }
  | { kind: "anchor"; id: string; filePath: string; anchorKey: string }
  | { kind: "card"; id: string; filePath: string; anchorKey: string };

/**
 * Hierarchical view: per file → per (line/range) → per thread card.
 *
 * When `hideFilePath` is true (single-file scope), the file group is implicit
 * — we render anchor groups directly without a file header.
 *
 * Implements the WAI-ARIA tree pattern: the outer container is `role="tree"`,
 * every focusable element (file header, anchor header, thread card) is a
 * `role="treeitem"`, and group containers carry `role="group"`. A single
 * roving tabindex moves across all treeitems.
 */
export function ThreadList({
  comments,
  isLoading,
  hideFilePath,
  hiddenCount,
  prNumber,
  currentFilePath,
  repoPath,
  sha,
}: ThreadListProps) {
  const { t } = useTranslation();
  const selectedId = useSelectedThread((s) => s.selectedCommentId);
  const select = useSelectedThread((s) => s.select);
  const queryClient = useQueryClient();
  const navigateToComment = useNavigateToComment(prNumber, currentFilePath);
  const anchorGroups = useMemo(() => groupByAnchor(comments), [comments]);
  const fileGroups = useMemo(() => groupByFile(anchorGroups), [anchorGroups]);

  // `Reopen` flips a `resolved` comment back to `submitted` via the same
  // command the inline card uses. Lives here (not in ThreadCard) so we can
  // share the React Query mutation + cache invalidation with the rest of
  // the comments feature.
  //
  // The mutation variables carry `filePath` so the per-file query
  // invalidation uses the value captured at call time. Looking it up via
  // `comments.find(...)` would race the user changing scope/filter while
  // the mutation is in flight — by the time `onSuccess` runs, the
  // reopened row may no longer be in `comments`, and the per-file slice
  // would silently miss its refresh.
  const reopen = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: CommentUpdate; filePath: string }) =>
      ipc.comments.update(id, patch).then((r) => {
        if (!r.ok) throw r.error;
        return r.value;
      }),
    onSuccess: (_data, vars) => {
      if (prNumber === undefined) return;
      queryClient.invalidateQueries({ queryKey: ["local-comments", prNumber] });
      queryClient.invalidateQueries({
        queryKey: ["local-comments", prNumber, vars.filePath],
      });
    },
  });

  // Expansion state — keyed independently for files and anchors so a file
  // collapse doesn't drop the user's per-anchor preferences inside it.
  // Default-expanded: any key not present in the set is treated as expanded.
  const [collapsedFiles, setCollapsedFiles] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsedAnchors, setCollapsedAnchors] = useState<ReadonlySet<string>>(() => new Set());

  const toggleFile = useCallback((path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);
  const expandFile = useCallback((path: string) => {
    setCollapsedFiles((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);
  const collapseFile = useCallback((path: string) => {
    setCollapsedFiles((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);
  const toggleAnchor = useCallback((key: string) => {
    setCollapsedAnchors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const expandAnchor = useCallback((key: string) => {
    setCollapsedAnchors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);
  const collapseAnchor = useCallback((key: string) => {
    setCollapsedAnchors((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // Refs for every focusable treeitem, keyed by `NavItem.id`. One map keeps
  // headers and cards uniform so the roving-tabindex helpers don't need to
  // know what type of element they're focusing.
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const refSetters = useRef(new Map<string, (node: HTMLButtonElement | null) => void>());
  const setItemRef = useCallback((id: string) => {
    let cb = refSetters.current.get(id);
    if (cb) return cb;
    cb = (node: HTMLButtonElement | null) => {
      if (node) itemRefs.current.set(id, node);
      else itemRefs.current.delete(id);
    };
    refSetters.current.set(id, cb);
    return cb;
  }, []);

  // Flat ordered list of all visible treeitems. Drives roving tabindex and
  // keyboard navigation; cards under collapsed groups are absent so headers
  // remain reachable for re-expansion.
  const navItems = useMemo<NavItem[]>(() => {
    const out: NavItem[] = [];
    for (const file of fileGroups) {
      const fileExpanded = hideFilePath ? true : !collapsedFiles.has(file.filePath);
      if (!hideFilePath) {
        out.push({ kind: "file", id: fileItemId(file.filePath), filePath: file.filePath });
      }
      if (!fileExpanded) continue;
      for (const anchor of file.anchors) {
        const anchorExpanded = !collapsedAnchors.has(anchor.key);
        out.push({
          kind: "anchor",
          id: anchorItemId(anchor.key),
          filePath: anchor.filePath,
          anchorKey: anchor.key,
        });
        if (!anchorExpanded) continue;
        out.push({
          kind: "card",
          id: cardItemId(anchor.key),
          filePath: anchor.filePath,
          anchorKey: anchor.key,
        });
      }
    }
    return out;
  }, [fileGroups, collapsedFiles, collapsedAnchors, hideFilePath]);

  // Active treeitem (the one that owns `tabIndex={0}`). Stored as id so the
  // identity survives re-orderings of the underlying tree shape.
  const [activeId, setActiveId] = useState<string | null>(null);

  // Keep `activeId` in sync with the visible list — clamp when items disappear,
  // seed when first rendered.
  useEffect(() => {
    if (navItems.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    const stillVisible = navItems.some((i) => i.id === activeId);
    if (!stillVisible) setActiveId(navItems[0]?.id ?? null);
  }, [navItems, activeId]);

  // Resolve the *render-time* roving-tabindex target. `activeId` may still be
  // `null` on first paint (the seeding effect runs after commit), so fall back
  // to the first navigable item so the tree is reliably tabbable from the
  // very first render.
  const effectiveActiveId =
    activeId && navItems.some((i) => i.id === activeId) ? activeId : (navItems[0]?.id ?? null);

  // Prune dangling refs / setters for items that no longer exist.
  useEffect(() => {
    const live = new Set(navItems.map((i) => i.id));
    for (const id of refSetters.current.keys()) {
      if (!live.has(id)) refSetters.current.delete(id);
    }
    for (const id of itemRefs.current.keys()) {
      if (!live.has(id)) itemRefs.current.delete(id);
    }
  }, [navItems]);

  const navItemsRef = useRef<NavItem[]>(navItems);
  useEffect(() => {
    navItemsRef.current = navItems;
  }, [navItems]);

  const focusItem = useCallback((id: string | null) => {
    if (!id) return;
    const node = itemRefs.current.get(id);
    if (node) node.focus();
  }, []);

  const moveActive = useCallback(
    (id: string | null) => {
      if (!id) return;
      setActiveId(id);
      focusItem(id);
    },
    [focusItem],
  );

  // Bring the selected thread's card into view when selection changes
  // externally (e.g. clicking an inline marker in the preview). Honor
  // `prefers-reduced-motion`. Auto-expands the path so the leaf card is
  // reachable.
  useEffect(() => {
    if (selectedId === null) return;
    const match = anchorGroups.find((g) => g.comments.some((c) => c.id === selectedId));
    if (!match) return;

    expandFile(match.filePath);
    expandAnchor(match.key);

    const node = itemRefs.current.get(cardItemId(match.key));
    if (!node) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [selectedId, anchorGroups, expandFile, expandAnchor]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const list = navItemsRef.current;
      if (list.length === 0) return;
      // Match render-time fallback: if `activeId` isn't yet seeded, treat the
      // first navigable item as the active one so keyboard nav works on the
      // very first interaction after mount.
      const targetId = activeId ?? list[0]?.id ?? null;
      const currentIndex = Math.max(
        0,
        list.findIndex((i) => i.id === targetId),
      );
      const current = list[currentIndex];
      if (!current) return;
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = list[Math.min(currentIndex + 1, list.length - 1)];
          if (next) moveActive(next.id);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const next = list[Math.max(currentIndex - 1, 0)];
          if (next) moveActive(next.id);
          break;
        }
        case "Home": {
          e.preventDefault();
          const first = list[0];
          if (first) moveActive(first.id);
          break;
        }
        case "End": {
          e.preventDefault();
          const last = list[list.length - 1];
          if (last) moveActive(last.id);
          break;
        }
        case "ArrowRight": {
          // Tree pattern: on a collapsed group → expand. On an expanded group
          // or a card → move to the next visible item (typically the first
          // child). Cards have no further nesting, so this just advances.
          e.preventDefault();
          if (current.kind === "file" && collapsedFiles.has(current.filePath)) {
            expandFile(current.filePath);
          } else if (current.kind === "anchor" && collapsedAnchors.has(current.anchorKey)) {
            expandAnchor(current.anchorKey);
          } else {
            const next = list[Math.min(currentIndex + 1, list.length - 1)];
            if (next) moveActive(next.id);
          }
          break;
        }
        case "ArrowLeft": {
          // Tree pattern: on an expanded group → collapse. On a collapsed
          // group or a leaf → move focus to the parent header.
          e.preventDefault();
          if (current.kind === "file") {
            if (!collapsedFiles.has(current.filePath)) {
              collapseFile(current.filePath);
            }
            // Files have no parent — nothing else to do at the top level.
          } else if (current.kind === "anchor") {
            if (!collapsedAnchors.has(current.anchorKey)) {
              collapseAnchor(current.anchorKey);
            } else if (!hideFilePath) {
              moveActive(fileItemId(current.filePath));
            }
          } else {
            // Card: collapse its parent anchor and focus the anchor header so
            // ArrowRight can re-expand it.
            collapseAnchor(current.anchorKey);
            moveActive(anchorItemId(current.anchorKey));
          }
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          if (current.kind === "file") {
            toggleFile(current.filePath);
          } else if (current.kind === "anchor") {
            toggleAnchor(current.anchorKey);
          } else {
            const anchor = anchorGroups.find((g) => g.key === current.anchorKey);
            const head = anchor?.comments[0];
            if (head) {
              select(head.id);
              navigateToComment(head.filePath, getAnchorScrollLine(head));
            }
          }
          break;
        }
        default:
          break;
      }
    },
    [
      activeId,
      moveActive,
      collapsedFiles,
      collapsedAnchors,
      expandFile,
      expandAnchor,
      collapseFile,
      collapseAnchor,
      toggleFile,
      toggleAnchor,
      hideFilePath,
      anchorGroups,
      select,
      navigateToComment,
    ],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (anchorGroups.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
        {t("main.threads.empty")}
      </p>
    );
  }

  // `Reopen` is only wired when we know which PR's cache to invalidate.
  // Without `prNumber` we'd have nothing to refresh after the mutation.
  const onReopen =
    prNumber !== undefined
      ? (comment: ReviewComment) => {
          select(comment.id);
          reopen.mutate({
            id: comment.id,
            patch: { state: "submitted" },
            filePath: comment.filePath,
          });
        }
      : undefined;

  return (
    <div
      role="tree"
      aria-label={t("main.threads.tree.ariaLabel")}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-3 outline-none"
    >
      {fileGroups.map((file) => {
        const fileExpanded = hideFilePath ? true : !collapsedFiles.has(file.filePath);
        // Each `ThreadGroup` (anchor) is one thread; the i18n key labels
        // `{{count}} thread(s)`, so count anchor groups, not comments.
        const fileThreadCount = file.anchors.length;
        const fileId = fileItemId(file.filePath);
        const anchorChildren = file.anchors.map((anchor) => {
          const isSelected = anchor.comments.some((c) => c.id === selectedId);
          const anchorExpanded = !collapsedAnchors.has(anchor.key);
          const aId = anchorItemId(anchor.key);
          const cId = cardItemId(anchor.key);
          return (
            <ThreadAnchorGroup
              key={anchor.key}
              ref={setItemRef(aId)}
              anchorLabel={formatAnchorLabel(anchor.comments[0], t)}
              threadCount={anchor.comments.length}
              expanded={anchorExpanded}
              tabIndex={effectiveActiveId === aId ? 0 : -1}
              onFocus={() => setActiveId(aId)}
              onToggle={() => {
                setActiveId(aId);
                toggleAnchor(anchor.key);
              }}
            >
              <ThreadCard
                ref={setItemRef(cId)}
                group={anchor}
                selected={isSelected}
                hideFilePath={hideFilePath}
                hideAnchorLabel
                asTreeItem
                tabIndex={effectiveActiveId === cId ? 0 : -1}
                onFocus={() => setActiveId(cId)}
                repoPath={repoPath}
                sha={sha}
                onSelect={(comment) => {
                  setActiveId(cId);
                  select(comment.id);
                  navigateToComment(comment.filePath, getAnchorScrollLine(comment));
                }}
                onReopen={onReopen}
              />
            </ThreadAnchorGroup>
          );
        });
        if (hideFilePath) {
          // Single-file scope — there's no file header (no owning treeitem),
          // so the wrapper carries `role="presentation"` rather than `group`:
          // a `role="group"` in a tree must be owned by a `treeitem`. This
          // keeps the anchor headers as direct children of the `tree`.
          return (
            <div key={file.filePath} role="presentation" className="flex flex-col gap-2">
              {anchorChildren}
            </div>
          );
        }
        return (
          <ThreadFileGroup
            key={file.filePath}
            ref={setItemRef(fileId)}
            filePath={file.filePath}
            threadCount={fileThreadCount}
            expanded={fileExpanded}
            tabIndex={effectiveActiveId === fileId ? 0 : -1}
            onFocus={() => setActiveId(fileId)}
            onToggle={() => {
              setActiveId(fileId);
              toggleFile(file.filePath);
            }}
          >
            {anchorChildren}
          </ThreadFileGroup>
        );
      })}
      {hiddenCount > 0 ? (
        <p className="pt-2 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
          {t("main.threads.hiddenCount", { count: hiddenCount })}
        </p>
      ) : null}
    </div>
  );
}

function fileItemId(filePath: string): string {
  return `file::${filePath}`;
}

function anchorItemId(anchorKey: string): string {
  return `anchor::${anchorKey}`;
}

function cardItemId(anchorKey: string): string {
  return `card::${anchorKey}`;
}

function getAnchorScrollLine(comment: ReviewComment): number {
  const a = comment.anchor;
  if (a.kind === "singleLine") return a.line;
  return a.endLine;
}

function formatAnchorLabel(
  head: ReviewComment | undefined,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (!head) return "";
  const a = head.anchor;
  if (a.kind === "singleLine") return t("threads.row.anchorLine", { line: a.line });
  if (a.startLine === a.endLine) return t("threads.row.anchorLine", { line: a.startLine });
  return t("threads.row.anchorRange", { start: a.startLine, end: a.endLine });
}

interface FileBucket {
  filePath: string;
  anchors: ThreadGroup[];
}

function groupByFile(anchors: ThreadGroup[]): FileBucket[] {
  const buckets = new Map<string, FileBucket>();
  for (const anchor of anchors) {
    const existing = buckets.get(anchor.filePath);
    if (existing) {
      existing.anchors.push(anchor);
    } else {
      buckets.set(anchor.filePath, { filePath: anchor.filePath, anchors: [anchor] });
    }
  }
  for (const bucket of buckets.values()) {
    bucket.anchors.sort((a, b) => a.startLine - b.startLine);
  }
  return Array.from(buckets.values()).sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function groupByAnchor(comments: ReviewComment[]): ThreadGroup[] {
  const buckets = new Map<string, ThreadGroup>();
  for (const comment of comments) {
    const startLine = startLineOf(comment);
    const endLine = endLineOf(comment);
    // Include the anchor extent in the key so a single-line and a multi-line
    // range that share `startLine` render as distinct cards.
    const key = `${comment.filePath}::${startLine}:${endLine}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.comments.push(comment);
    } else {
      buckets.set(key, {
        key,
        filePath: comment.filePath,
        startLine,
        comments: [comment],
      });
    }
  }
  for (const group of buckets.values()) {
    group.comments.sort((a, b) => a.createdAt - b.createdAt);
  }
  // Sort groups by file path, then by start line — stable, predictable order.
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    return a.startLine - b.startLine;
  });
}

function startLineOf(comment: ReviewComment): number {
  const a = comment.anchor;
  if (a.kind === "singleLine") return a.line;
  return a.startLine;
}

function endLineOf(comment: ReviewComment): number {
  const a = comment.anchor;
  if (a.kind === "singleLine") return a.line;
  return a.endLine;
}
