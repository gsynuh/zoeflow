import { atom } from "nanostores";

export type ThemeMode = "light" | "dark";

/**
 * Resolve the initial theme mode for the current environment.
 */
function getDefaultThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const prefersDark = window.matchMedia?.(
      "(prefers-color-scheme: dark)",
    )?.matches;
    return prefersDark ? "dark" : "light";
  } catch {
    return "dark";
  }
}

export const $themeMode = atom<ThemeMode>(getDefaultThemeMode());

/**
 * Set the current theme mode.
 */
export function setThemeMode(mode: ThemeMode) {
  $themeMode.set(mode);
}

/**
 * Toggle the theme mode between light and dark.
 */
export function toggleThemeMode() {
  $themeMode.set($themeMode.get() === "dark" ? "light" : "dark");
}
