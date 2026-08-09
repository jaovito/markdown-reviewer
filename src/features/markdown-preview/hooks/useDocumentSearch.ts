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
 * Scrolls the main document viewport to center the target element vertically,
 * handling elements nested inside horizontal scroll containers (like <pre> or <table>).
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

  // Ensure horizontal alignment if inside a long code block line or table
  try {
    activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  } catch {
    // Ignore browser scroll errors on detached nodes
  }
}

export function useDocumentSearch({ containerRef, sourceHtml }: UseDocumentSearchOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  const matchElementsRef = useRef<HTMLElement[]>([]);

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
    const matches = matchElementsRef.current;
    if (matches.length === 0) return;

    const clampedIndex = Math.max(0, Math.min(targetIndex, matches.length - 1));

    matches.forEach((el, i) => {
      if (i === clampedIndex) {
        el.className = ACTIVE_MATCH_CLASS;
      } else {
        el.className = INACTIVE_MATCH_CLASS;
      }
    });

    const activeEl = matches[clampedIndex];
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

    const textNodes: Text[] = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode as Text);
      currentNode = walker.nextNode();
    }

    const newMatchElements: HTMLElement[] = [];

    for (const node of textNodes) {
      const nodeText = node.nodeValue;
      if (!nodeText) continue;

      regex.lastIndex = 0;
      let match = regex.exec(nodeText);
      if (!match) continue;

      const fragment = document.createDocumentFragment();
      let lastIdx = 0;

      while (match !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        if (matchStart > lastIdx) {
          fragment.appendChild(document.createTextNode(nodeText.slice(lastIdx, matchStart)));
        }

        const mark = document.createElement("mark");
        mark.setAttribute("data-search-match", "true");
        mark.className = INACTIVE_MATCH_CLASS;
        mark.textContent = match[0];
        fragment.appendChild(mark);
        newMatchElements.push(mark);

        lastIdx = matchEnd;
        match = regex.exec(nodeText);
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
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isOpen,
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
