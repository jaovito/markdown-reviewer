import { create } from "zustand";

interface MinimizedThreadsState {
  /** Set of group keys (the bucket's `line`) that are collapsed locally. */
  minimized: Set<number>;
  isMinimized: (line: number) => boolean;
  minimize: (line: number) => void;
  expand: (line: number) => void;
  toggle: (line: number) => void;
}

/**
 * Local-only UI state for collapsed inline threads. Not persisted — the Hide
 * button on a thread card only collapses the visual card down to a small
 * "open" badge inside the highlighted line; the underlying comment row stays
 * `draft`/`submitted` exactly as before.
 */
export const useMinimizedThreads = create<MinimizedThreadsState>((set, get) => ({
  minimized: new Set<number>(),
  isMinimized: (line) => get().minimized.has(line),
  minimize: (line) =>
    set((s) => {
      if (s.minimized.has(line)) return s;
      const next = new Set(s.minimized);
      next.add(line);
      return { minimized: next };
    }),
  expand: (line) =>
    set((s) => {
      if (!s.minimized.has(line)) return s;
      const next = new Set(s.minimized);
      next.delete(line);
      return { minimized: next };
    }),
  toggle: (line) =>
    set((s) => {
      const next = new Set(s.minimized);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return { minimized: next };
    }),
}));
