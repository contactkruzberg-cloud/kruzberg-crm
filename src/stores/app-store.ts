import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type CreateIntent = 'deal' | 'venue' | 'contact' | 'task' | 'band' | 'tour';

interface AppState {
  sidebarOpen: boolean;
  /** Phone/tablet: sidebar shown as an overlay drawer (not persisted). */
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  /** Global "+ Nouveau" dialog to show (header, palette). */
  createIntent: { kind: CreateIntent; venueId?: string } | null;
  theme: Theme;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  openCreate: (kind: CreateIntent, venueId?: string) => void;
  closeCreate: () => void;
  setTheme: (theme: Theme) => void;
}

export const THEME_STORAGE_KEY = 'kruzberg-app';

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileNavOpen: false,
      commandPaletteOpen: false,
      settingsOpen: false,
      createIntent: null,
      theme: 'dark',
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      openCreate: (kind, venueId) => set({ createIntent: { kind, venueId }, commandPaletteOpen: false, mobileNavOpen: false }),
      closeCreate: () => set({ createIntent: null }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      // Remembered across reloads: theme and collapsed sidebar.
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarOpen: s.sidebarOpen, theme: s.theme }),
      // Hydrated after mount (Providers) to keep server and client renders identical.
      skipHydration: true,
    },
  ),
);
