import type { CommentState } from "@/shared/ipc/contract";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type FilterableState = Exclude<CommentState, "deleted">;

export const DEFAULT_THREADS_FILTER: Record<FilterableState, boolean> = {
  draft: true,
  submitted: true,
  resolved: false,
  hidden: false,
};

interface ThreadsFilterState {
  /** Map of state → whether the threads pane currently shows it. */
  filter: Record<FilterableState, boolean>;
  toggle: (state: FilterableState) => void;
  setFilter: (filter: Record<FilterableState, boolean>) => void;
  /** Force a state into the visible set (no-op if already enabled). */
  ensureVisible: (state: FilterableState) => void;
}

const STORAGE_KEY = "markdown-reviewer:threads-filter";

/**
 * Cross-feature store for the threads-pane filter chips. Lifted out of the
 * pane's local state so other features (notably the inline count badge in the
 * markdown preview) can pick a comment that's actually visible under the
 * current filter — and, when a hidden state is required, flip the matching
 * chip on so the selection becomes reachable.
 *
 * TODO(phase-4 #22): persist via the Rust `ui_state` store once that adapter
 * lands. Keeping it in `localStorage` for now keeps this PR frontend-only.
 */
export const useThreadsFilter = create<ThreadsFilterState>()(
  persist(
    (set) => ({
      filter: { ...DEFAULT_THREADS_FILTER },
      toggle: (state) => set((s) => ({ filter: { ...s.filter, [state]: !s.filter[state] } })),
      setFilter: (filter) => set({ filter }),
      ensureVisible: (state) =>
        set((s) => (s.filter[state] ? s : { filter: { ...s.filter, [state]: true } })),
    }),
    {
      name: STORAGE_KEY,
      // Only persist the filter map; methods are reconstructed at boot.
      partialize: (s) => ({ filter: s.filter }),
      // Defensive merge in case a future revision adds a new `CommentState`
      // — fall back to the default for any missing key so the chip never
      // becomes `undefined` (which would break the truthy check above).
      merge: (persisted, current) => {
        const stored = (persisted as Partial<ThreadsFilterState> | undefined)?.filter;
        return {
          ...current,
          filter: { ...DEFAULT_THREADS_FILTER, ...(stored ?? {}) },
        };
      },
    },
  ),
);
