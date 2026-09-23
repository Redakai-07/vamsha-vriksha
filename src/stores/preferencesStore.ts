"use client";

import { create } from "zustand";

import { preferencesRepo } from "@/lib/db/repositories/preferences";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/domain/types";

/**
 * User preferences are persisted in IndexedDB (never localStorage) and mirrored
 * here for synchronous reads in render. The store starts from the defaults and
 * is hydrated once on boot; writes go through the repository.
 */
interface PreferencesState {
  preferences: UserPreferences;
  hydrated: boolean;
  hydrate(): Promise<UserPreferences>;
  update(patch: Partial<UserPreferences>): Promise<void>;
  reset(): Promise<void>;
}

function applyThemeToDocument(theme: UserPreferences["theme"]) {
  if (typeof document === "undefined") return;
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: { ...DEFAULT_PREFERENCES },
  hydrated: false,

  hydrate: async () => {
    const preferences = await preferencesRepo.all();
    set({ preferences, hydrated: true });
    applyThemeToDocument(preferences.theme);
    return preferences;
  },

  update: async (patch) => {
    const preferences = { ...get().preferences, ...patch };
    set({ preferences });
    if (patch.theme) applyThemeToDocument(preferences.theme);
    await preferencesRepo.save(patch);
  },

  reset: async () => {
    const preferences = await preferencesRepo.reset();
    set({ preferences });
    applyThemeToDocument(preferences.theme);
  },
}));

/** Applies the persisted theme as early as possible to avoid a flash. */
export function syncThemeFromStorage(): void {
  void usePreferencesStore
    .getState()
    .hydrate()
    .catch(() => {
      applyThemeToDocument(DEFAULT_PREFERENCES.theme);
    });
}

export function selectPreferences(state: PreferencesState) {
  return state.preferences;
}
