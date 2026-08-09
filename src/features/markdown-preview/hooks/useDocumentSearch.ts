import { useCallback, useEffect, useRef, useState } from "react";

interface UseDocumentSearchOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  sourceHtml: string;
}

const INACTIVE_MATCH_CLASS =
  "bg-amber-300/80 text-slate-950 dark:bg-amber-900/80 dark:text-amber-100 dark:ring-1 dark:ring-amber-500/50 px-0.5 rounded-xs transition-colors font-medium";

const ACTIVE_MATCH_CLASS =
  "bg-amber-400 text-slate-950 dark:bg-amber-400 dark:text-slate-950 px-0.5 rounded-xs ring-2 ring-amber-500 font-bold shadow-sm transition-all";

/**
 * Scrolls the main document viewport so the target search match appears
 * near the top of the viewport (with ~70px offset for the toolbar).
 */
function scrollMatchIntoView(activeEl: HTMLElement) {
  // Find the primary document scroll container (e.g. div.overflow-auto)
  const scrollParent =
    (activeEl.closest(".overflow-auto") as HTMLElement | null) ??
    (activeEl.closest("section") as HTMLElement | null);

  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();

    const relativeTop = elRect.top - parentRect.top;
    // Align ~70px below the top of the viewport so the target match sits at the top of the screen
    const targetScrollTop = scrollParent.scrollTop + relativeTop - 70;

    scrollParent.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });
  }

  // Handle horizontal alignment if inside a long code block line or table
  const horizParent = activeEl.closest("pre, table") as HTMLElement | null;
  if (horizParent && horizParent.scrollWidth > horizParent.clientWidth) {
    const hRect = horizParent.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    const relativeLeft = elRect.left - hRect.left;
    const targetScrollLeft = horizParent.scrollLeft + relativeLeft - 20;
    horizParent.scrollTo({
      left: Math.max(0, targetScrollLeft),
      behavior: "smooth",
    });
  }
}

export function useDocumentSearch({ containerRef, sourceHtml }: UseDocumentSearchOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [query, setQuery] = useState("");
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  // A visible match can span several text nodes, such as `hello **world**`.
  // Keep its mark fragments together so it remains one navigable result.
  const matchElementsRef = useRef<HTMLElement[][]>([]);

  const clearHighlights = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const marks = Array.from(container.querySelectorAll<HTMLElement>("mark[data-search-match]"));
    for (const mark of marks) {
      const text = mark.textContent ?? "";
      const textNode = document.createTextNode(text);
      mark.replaceWith(textNode);
    }
    container.normalize();
    matchElementsRef.current = [];
  }, [containerRef]);

  const highlightAndScrollTo = useCallback((targetIndex: number) => {
    const matchGroups = matchElementsRef.current;
    if (matchGroups.length === 0) return;

    const clampedIndex = Math.max(0, Math.min(targetIndex, matchGroups.length - 1));

    matchGroups.forEach((fragments, i) => {
      for (const fragment of fragments) {
        fragment.className = i === clampedIndex ? ACTIVE_MATCH_CLASS : INACTIVE_MATCH_CLASS;
      }
    });

    const activeEl = matchGroups[clampedIndex]?.[0];
    if (activeEl) {
      requestAnimationFrame(() => {
        scrollMatchIntoView(activeEl);
      });
    }
  }, []);

  const applyHighlights = useCallback(() => {
    clearHighlights();

    const container = containerRef.current;
    if (!container || !isOpen || !query.trim() || !sourceHtml) {
      setMatchCount(0);
      setCurrentIndex(0);
      return;
    }

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = isCaseSensitive ? "g" : "gi";
    const regex = new RegExp(escapedQuery, flags);

    // Collect eligible text nodes
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Ignore nodes inside thread overlays or inputs
        if (
          parent.closest(".inline-thread-card") ||
          parent.closest(".selection-overlay") ||
          parent.closest("button") ||
          parent.closest("input") ||
          parent.tagName === "SCRIPT" ||
          parent.tagName === "STYLE"
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes: Array<{ node: Text; start: number; end: number }> = [];
    let fullText = "";
    let currentNode = walker.nextNode();
    while (currentNode) {
      const node = currentNode as Text;
      const text = node.nodeValue ?? "";
      textNodes.push({ node, start: fullText.length, end: fullText.length + text.length });
      fullText += text;
      currentNode = walker.nextNode();
    }

    const matches: Array<{ start: number; end: number }> = [];
    let match = regex.exec(fullText);
    while (match !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length });
      match = regex.exec(fullText);
    }

    const newMatchElements = matches.map(() => [] as HTMLElement[]);

    for (const { node, start, end } of textNodes) {
      const nodeText = node.nodeValue ?? "";
      const nodeMatches = matches
        .map((match, index) => ({
          index,
          start: Math.max(start, match.start) - start,
          end: Math.min(end, match.end) - start,
        }))
        .filter((match) => match.start < match.end);
      if (nodeMatches.length === 0) continue;

      const fragment = document.createDocumentFragment();
      let lastIdx = 0;

      for (const match of nodeMatches) {
        if (match.start > lastIdx) {
          fragment.appendChild(document.createTextNode(nodeText.slice(lastIdx, match.start)));
        }

        const mark = document.createElement("mark");
        mark.setAttribute("data-search-match", "true");
        mark.className = INACTIVE_MATCH_CLASS;
        mark.textContent = nodeText.slice(match.start, match.end);
        fragment.appendChild(mark);
        newMatchElements[match.index]?.push(mark);

        lastIdx = match.end;
      }

      if (lastIdx < nodeText.length) {
        fragment.appendChild(document.createTextNode(nodeText.slice(lastIdx)));
      }

      node.replaceWith(fragment);
    }

    matchElementsRef.current = newMatchElements;
    setMatchCount(newMatchElements.length);
    setCurrentIndex(0);

    if (newMatchElements.length > 0) {
      highlightAndScrollTo(0);
    }
  }, [
    containerRef,
    clearHighlights,
    isOpen,
    query,
    isCaseSensitive,
    sourceHtml,
    highlightAndScrollTo,
  ]);

  // Re-run highlighting when dependencies change
  useEffect(() => {
    applyHighlights();
    return () => {
      clearHighlights();
    };
  }, [applyHighlights, clearHighlights]);

  const nextMatch = useCallback(() => {
    setMatchCount((count) => {
      if (count === 0) return 0;
      setCurrentIndex((prev) => {
        const next = (prev + 1) % count;
        highlightAndScrollTo(next);
        return next;
      });
      return count;
    });
  }, [highlightAndScrollTo]);

  const prevMatch = useCallback(() => {
    setMatchCount((count) => {
      if (count === 0) return 0;
      setCurrentIndex((prev) => {
        const next = (prev - 1 + count) % count;
        highlightAndScrollTo(next);
        return next;
      });
      return count;
    });
  }, [highlightAndScrollTo]);

  const openSearch = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    clearHighlights();
  }, [clearHighlights]);

  const toggleCaseSensitive = useCallback(() => {
    setIsCaseSensitive((prev) => !prev);
  }, []);

  // Global hotkey handler for Cmd+F / Ctrl+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsOpen(true);
        // Bump trigger so the focus effect re-fires even if bar was already open
        setFocusTrigger((n) => n + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isOpen,
    focusTrigger,
    query,
    setQuery,
    isCaseSensitive,
    toggleCaseSensitive,
    currentIndex,
    matchCount,
    nextMatch,
    prevMatch,
    openSearch,
    closeSearch,
  };
}
