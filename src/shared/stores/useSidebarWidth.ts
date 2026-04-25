import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_DEFAULT_WIDTH = 280;

interface SidebarWidthState {
  width: number;
  setWidth: (next: number) => void;
}

const STORAGE_KEY = "markdown-reviewer:sidebar-width";

export const useSidebarWidth = create<SidebarWidthState>()(
  persist(
    (set) => ({
      width: SIDEBAR_DEFAULT_WIDTH,
      setWidth: (next) =>
        set({
          width: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(next))),
        }),
    }),
    { name: STORAGE_KEY },
  ),
);
