import { useCallback, useEffect, useRef, useState } from "react";

interface UseDocumentSearchOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  sourceHtml: string;
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
        mark.className =
          "bg-amber-200 dark:bg-amber-500/40 text-foreground px-0.5 rounded-xs transition-colors";
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
  }, [containerRef, clearHighlights, isOpen, query, isCaseSensitive, sourceHtml]);

  // Re-run highlighting when dependencies change
  useEffect(() => {
    applyHighlights();
  }, [applyHighlights]);

  // Highlight active match and scroll to view
  useEffect(() => {
    const matches = matchElementsRef.current;
    if (matches.length === 0) return;

    const clampedIndex = Math.max(0, Math.min(currentIndex, matches.length - 1));

    matches.forEach((el, i) => {
      if (i === clampedIndex) {
        el.className =
          "bg-amber-400 dark:bg-amber-400 text-black px-0.5 rounded-xs ring-2 ring-amber-600 font-semibold shadow-xs transition-all";
      } else {
        el.className =
          "bg-amber-200 dark:bg-amber-500/40 text-foreground px-0.5 rounded-xs transition-colors";
      }
    });

    const activeEl = matches[clampedIndex];
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIndex]);

  const nextMatch = useCallback(() => {
    setMatchCount((count) => {
      if (count === 0) return 0;
      setCurrentIndex((prev) => (prev + 1) % count);
      return count;
    });
  }, []);

  const prevMatch = useCallback(() => {
    setMatchCount((count) => {
      if (count === 0) return 0;
      setCurrentIndex((prev) => (prev - 1 + count) % count);
      return count;
    });
  }, []);

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
