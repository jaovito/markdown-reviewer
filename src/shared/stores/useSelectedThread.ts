import { create } from "zustand";

interface SelectedThreadState {
  selectedCommentId: number | null;
  select: (id: number) => void;
  clear: () => void;
}

/**
 * Lightweight cross-feature bus so the threads pane can react when the user
 * clicks an inline marker in the markdown preview. Intentionally not
 * persisted — it's a transient UI selection.
 */
export const useSelectedThread = create<SelectedThreadState>((set) => ({
  selectedCommentId: null,
  select: (id) => set({ selectedCommentId: id }),
  clear: () => set({ selectedCommentId: null }),
}));
