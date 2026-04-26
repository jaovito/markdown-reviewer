import { create } from "zustand";

/**
 * Composite key `${prNumber}:${filePath}:${startLine}:${endLine}` so the
 * minimized state is scoped per (PR, file) — minimizing a thread in one
 * file no longer collapses an unrelated thread that happens to share the
 * same line range in another file.
 */
export type MinimizedKey = string;

export function minimizedKey(
  prNumber: number,
  filePath: string,
  startLine: number,
  endLine: number,
): MinimizedKey {
  return `${prNumber}:${filePath}:${startLine}:${endLine}`;
}

interface MinimizedThreadsState {
  /** Set of `(startLine, endLine)` keys that are collapsed locally. */
  minimized: Set<MinimizedKey>;
  isMinimized: (key: MinimizedKey) => boolean;
  minimize: (key: MinimizedKey) => void;
  expand: (key: MinimizedKey) => void;
  toggle: (key: MinimizedKey) => void;
}

/**
 * Local-only UI state for collapsed inline threads. Not persisted — the Hide
 * button on a thread card only collapses the visual card down to a small
 * "open" badge inside the highlighted line; the underlying comment row stays
 * `draft`/`submitted` exactly as before.
 */
export const useMinimizedThreads = create<MinimizedThreadsState>((set, get) => ({
  minimized: new Set<MinimizedKey>(),
  isMinimized: (key) => get().minimized.has(key),
  minimize: (key) =>
    set((s) => {
      if (s.minimized.has(key)) return s;
      const next = new Set(s.minimized);
      next.add(key);
      return { minimized: next };
    }),
  expand: (key) =>
    set((s) => {
      if (!s.minimized.has(key)) return s;
      const next = new Set(s.minimized);
      next.delete(key);
      return { minimized: next };
    }),
  toggle: (key) =>
    set((s) => {
      const next = new Set(s.minimized);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { minimized: next };
    }),
}));
