"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Must match the Tailwind `duration-150` used below. */
const EXIT_MS = 150;

/**
 * The product's single modal shell (Design.md Level 3 elevation: muted
 * `bg-ink/40` backdrop with a 4px blur, Level 2 `shadow-raised` panel,
 * 16px radius, hairline border).
 *
 * Extracted from `AddProjectDialog` so dialogs share one implementation
 * rather than competing copies. Behaviour:
 * - Escape and backdrop click close.
 * - Background scroll is locked while open.
 * - Focus moves into the panel on open and returns to the previously focused
 *   element (the trigger) on close.
 * - Tab is trapped inside the panel so focus cannot land behind the dialog.
 *
 * Transitions are CSS-driven on purpose. A JS animation driver (motion /
 * Web Animations) writes its `initial` opacity as an inline style and only
 * advances it from `requestAnimationFrame`, which browsers pause in
 * background tabs — the dialog then renders invisible or half-faded. With
 * class-based transitions the resting state is the final state, so a paused
 * or throttled tab can never hide the dialog. `prefers-reduced-motion` is
 * already neutralised globally in `globals.css`.
 */
export function Modal({
  open,
  onClose,
  /** Accessible name when no visible heading is passed as `labelledBy`. */
  label,
  /** Id of the visible heading element, preferred over `label`. */
  labelledBy,
  children,
  /** Panel sizing/padding. Defaults to the wizard's proportions. */
  panelClassName,
  closeLabel = "Close",
}: {
  open: boolean;
  onClose: () => void;
  label?: string;
  labelledBy?: string;
  children: ReactNode;
  panelClassName?: string;
  closeLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  // Drive the enter/exit transition. `setTimeout` (not rAF) so the flip still
  // happens while the tab is backgrounded.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const enter = window.setTimeout(() => setEntered(true), 10);
      return () => window.clearTimeout(enter);
    }
    setEntered(false);
    const exit = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(exit);
  }, [open]);

  // Lock background scroll while visible.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Move focus in on open; return it to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => restoreTo?.focus?.();
  }, [open]);

  const focusable = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return [] as HTMLElement[];
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
  }, []);

  // Escape closes; Tab is trapped so focus cannot escape behind the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, focusable]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        className={cn(
          "fixed inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-150 ease-out",
          entered ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "relative z-10 my-4 w-full rounded-lg border border-border-hairline bg-surface shadow-raised focus:outline-none",
          "transition-[opacity,transform] duration-150 ease-out",
          entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.99] opacity-0",
          panelClassName ?? "max-w-3xl p-5 sm:p-7",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute right-2.5 top-2.5 rounded p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  );
}