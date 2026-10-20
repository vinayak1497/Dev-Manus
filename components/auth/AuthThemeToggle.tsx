"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import {
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  nextTheme,
  resolveTheme,
  type AuthTheme,
} from "@/lib/theme";

function readTheme(): AuthTheme {
  const value = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  return value === "night" ? "night" : "day";
}

function applyTheme(theme: AuthTheme) {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
}

function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode, file://); the sky still works.
    return null;
  }
}

/**
 * Day/night switch for the auth sky.
 *
 * The button never holds React state: it flips the `<html>` attribute that
 * the stylesheet keys off and remembers the choice. That keeps the
 * authentication form out of the theme update entirely — switching scenes
 * cannot remount the card or lose typed values — and it means the icon is
 * already correct on first paint (CSS picks sun/moon from the attribute set
 * by the inline script in the root layout).
 */
export function AuthThemeToggle() {
  useEffect(() => {
    // Until the visitor makes an explicit choice, follow the OS. The inline
    // script already resolved the first paint; this keeps a live OS change
    // in sync without ever overriding a stored preference.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      if (readStoredTheme()) return;
      applyTheme(resolveTheme(null, media.matches));
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <button
      type="button"
      className="auth-theme-toggle"
      aria-label="Switch between day and night sky"
      title="Switch between day and night sky"
      onClick={() => {
        const theme = nextTheme(readTheme());
        applyTheme(theme);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
          // Persisting the choice is best-effort; the switch still applies.
        }
      }}
    >
      <Sun className="auth-theme-toggle__sun" aria-hidden="true" size={18} />
      <Moon className="auth-theme-toggle__moon" aria-hidden="true" size={18} />
    </button>
  );
}
