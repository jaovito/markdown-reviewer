import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarCollapseState {
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setRightCollapsed: (collapsed: boolean) => void;
}

const STORAGE_KEY = "markdown-reviewer:sidebar-collapse";

export const useSidebarCollapse = create<SidebarCollapseState>()(
  persist(
    (set) => ({
      isLeftCollapsed: false,
      isRightCollapsed: false,
      toggleLeft: () => set((s) => ({ isLeftCollapsed: !s.isLeftCollapsed })),
      toggleRight: () => set((s) => ({ isRightCollapsed: !s.isRightCollapsed })),
      setLeftCollapsed: (collapsed) => set({ isLeftCollapsed: collapsed }),
      setRightCollapsed: (collapsed) => set({ isRightCollapsed: collapsed }),
    }),
    { name: STORAGE_KEY },
  ),
);
