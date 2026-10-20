import type { ReactNode } from "react";
import { AuthThemeToggle } from "@/components/auth/AuthThemeToggle";
import { SkyBackdrop } from "@/components/auth/sky/SkyBackdrop";
import { PRODUCT_NAME } from "@/lib/site";

export { GoogleIcon } from "@/components/auth/GoogleIcon";

/**
 * Authentication shell: a full-viewport living sky, a compact brand mark,
 * the day/night switch, and one centered glass card.
 *
 * The `orbitWord` prop is accepted for compatibility with the existing pages
 * but no longer used — the orbit visual is gone. Everything the pages render
 * goes inside the card, so `/login`, `/register`, and the OTP step share one
 * frame without any page-level layout changes.
 */
export function AuthShell({
  children,
}: {
  children: ReactNode;
  orbitWord?: string;
}) {
  return (
    <div className="auth-shell">
      <SkyBackdrop />

      <div className="auth-shell__content">
        <header className="auth-topbar">
          <a
            href="/"
            className="auth-brand"
            aria-label={`${PRODUCT_NAME} home`}
          >
            <span aria-hidden="true" className="auth-brand__mark">
              DS
            </span>
            <span className="auth-brand__name">{PRODUCT_NAME}</span>
          </a>
          <AuthThemeToggle />
        </header>

        <main id="main-content" className="auth-main">
          <div className="auth-card">{children}</div>
        </main>
      </div>
    </div>
  );
}
