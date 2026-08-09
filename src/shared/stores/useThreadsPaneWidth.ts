import { create } from "zustand";
import { persist } from "zustand/middleware";

export const THREADS_PANE_MIN_WIDTH = 280;
export const THREADS_PANE_MAX_WIDTH = 560;
export const THREADS_PANE_DEFAULT_WIDTH = 336;

interface ThreadsPaneWidthState {
  width: number;
  setWidth: (next: number) => void;
}

const STORAGE_KEY = "markdown-reviewer:threads-pane-width";

/**
 * Persisted width for the right-hand comments pane. Mirrors `useSidebarWidth`
 * (the left files panel) so both panels resize and remember their size the
 * same way.
 */
export const useThreadsPaneWidth = create<ThreadsPaneWidthState>()(
  persist(
    (set) => ({
      width: THREADS_PANE_DEFAULT_WIDTH,
      setWidth: (next) =>
        set({
          width: Math.min(
            THREADS_PANE_MAX_WIDTH,
            Math.max(THREADS_PANE_MIN_WIDTH, Math.round(next)),
          ),
        }),
    }),
    { name: STORAGE_KEY },
  ),
);
