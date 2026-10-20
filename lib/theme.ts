/**
 * Auth sky theme — pure helpers.
 *
 * The authentication pages are the only place with a dark surface today, so
 * the theme is expressed as a `data-auth-theme` attribute on `<html>` and all
 * dark rules are scoped to `.auth-*` selectors. This keeps the rest of the
 * product (light-only dashboard tokens) untouched.
 *
 * The attribute is written by the tiny inline script in `app/layout.tsx`
 * *before* first paint; these helpers are the single source of truth for the
 * storage key and the accepted values so the script, the toggle, and the
 * tests cannot drift apart.
 */

/** localStorage key for an explicit user choice. */
export const THEME_STORAGE_KEY = "devops-safeguard-theme";

/** Attribute read by `app/globals.css` (`[data-auth-theme="night"]`). */
export const THEME_ATTRIBUTE = "data-auth-theme";

export type AuthTheme = "day" | "night";

/** Explicitly stored value only — anything else is treated as "no choice". */
export function parseTheme(value: string | null | undefined): AuthTheme | null {
  return value === "day" || value === "night" ? value : null;
}

/**
 * Explicit choice wins; otherwise follow the OS preference. A missing
 * `matchMedia` (SSR, older browsers) resolves to the light daytime sky.
 */
export function resolveTheme(
  stored: string | null | undefined,
  prefersDark: boolean,
): AuthTheme {
  return parseTheme(stored) ?? (prefersDark ? "night" : "day");
}

/** The other theme — used by the toggle button. */
export function nextTheme(theme: AuthTheme): AuthTheme {
  return theme === "night" ? "day" : "night";
}
