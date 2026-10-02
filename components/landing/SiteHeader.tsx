"use client";

import { useEffect, useState } from "react";
import { LOGIN_HREF, NAV_LINKS, PRODUCT_NAME, REGISTER_HREF } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Floating glass pill navbar. Fixed height (56px) so it never shifts
 * layout; translucent fill + blur/saturate + hairline keeps link
 * contrast over any hero behind it.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <header
        className={cn(
          "mx-auto flex h-14 max-w-app items-center gap-4 rounded-2xl border px-3 transition-all duration-300 sm:px-4",
          "border-white/60 bg-white/55 shadow-[0_10px_40px_-16px_rgba(15,23,42,0.35)]",
          "backdrop-blur-xl backdrop-saturate-[180%]",
          "supports-[not_(backdrop-filter:blur(1px))]:bg-white/90",
          scrolled && "bg-white/70 shadow-[0_14px_44px_-16px_rgba(15,23,42,0.4)]",
        )}
      >
        <a
          href="#top"
          className="flex shrink-0 items-center gap-2"
          aria-label={`${PRODUCT_NAME} home`}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand font-mono text-[14px] font-semibold text-white"
          >
            DS
          </span>
          <span className="hidden text-[16px] font-semibold tracking-tight text-ink min-[400px]:inline">
            {PRODUCT_NAME}
          </span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-[14px] font-medium leading-5 text-ink-secondary transition-colors hover:bg-ink/[0.04] hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <a
            href={LOGIN_HREF}
            className="hidden rounded-full px-4 py-2 text-[14px] font-medium leading-5 text-ink transition-colors hover:bg-ink/[0.04] sm:inline"
          >
            Log in
          </a>
          <a
            href={REGISTER_HREF}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-b from-brand to-brand-hover px-4 py-2 text-[14px] font-semibold leading-5 text-white shadow-[0_6px_16px_-6px_rgba(21,94,239,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-6px_rgba(21,94,239,0.7)] active:translate-y-0"
          >
            <span className="hidden sm:inline">Add Your Project</span>
            <span className="sm:hidden">Add Project</span>
          </a>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/[0.04] lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none">
              {open ? (
                <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="mx-auto mt-2 max-w-app rounded-2xl border border-white/60 bg-white/80 p-2 shadow-[0_10px_40px_-16px_rgba(15,23,42,0.35)] backdrop-blur-xl backdrop-saturate-[180%] lg:hidden"
        >
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-2.5 text-[15px] font-medium text-ink-secondary hover:bg-ink/[0.04] hover:text-ink"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li className="mt-1 border-t border-border-hairline pt-2">
              <a
                href={LOGIN_HREF}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-2.5 text-[15px] font-medium text-ink hover:bg-ink/[0.04] sm:hidden"
              >
                Log in
              </a>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
