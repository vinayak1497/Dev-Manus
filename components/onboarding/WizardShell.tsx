"use client";

import type { ReactNode, Ref } from "react";
import { X } from "lucide-react";
import { WIZARD_STEP_META, type WizardStepId } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";
import { WizardProgress, WizardStepList } from "./WizardStepper";

type WizardShellProps = {
  /** Dialog panels are height-capped; the full page centers the same shell. */
  mode: "dialog" | "page";
  current: WizardStepId;
  completed: Set<WizardStepId>;
  onGo: (step: WizardStepId) => void;
  /** Focus target the parent moves to on step change (screen readers). */
  headingRef: Ref<HTMLDivElement>;
  /** Single close control: a button in dialog mode … */
  onExit?: () => void;
  /** … or a plain link on the full page. Exactly one of the two renders. */
  exitHref?: string;
  /** Sticky action row: Back / Continue / contextual actions. */
  footer: ReactNode;
  /** Secondary status line under the actions (e.g. submitting). */
  statusLine?: ReactNode;
  children: ReactNode;
};

/**
 * One layout shell for the whole onboarding journey, in both entry points.
 *
 * The outer box never moves: fixed, viewport-aware height, one width, sticky
 * header + progress + footer, and a single independently scrolling content
 * region. Short steps sit compactly inside it; long steps scroll inside it.
 * Nothing about the shell changes shape between steps — only the content
 * does — so there is no width/height jitter and no competing page scrollbars.
 */
export function WizardShell({
  mode,
  current,
  completed,
  onGo,
  headingRef,
  onExit,
  exitHref,
  footer,
  statusLine,
  children,
}: WizardShellProps) {
  const meta = WIZARD_STEP_META[current];
  const isComplete = current === "complete";
  return (
    <div
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border-hairline bg-surface shadow-raised",
        mode === "dialog"
          ? // Room below for the dialog's "open as page" link row.
            "h-[min(720px,calc(100dvh-10rem))] min-h-[440px]"
          : // Room above/below for the full page's own header and captions.
            "h-[min(720px,calc(100dvh-14rem))] min-h-[480px]",
      )}
    >
      {/* Compact header: identity + step position + the ONE close control. */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-hairline px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand font-mono text-[12px] font-semibold text-white"
          >
            DS
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-4 text-ink">
              Add project
            </p>
            <p className="mt-0.5 text-[12px] leading-4 text-ink-secondary" aria-live="polite">
              Step {meta.index + 1} of 10
            </p>
          </div>
        </div>
        {onExit ? (
          <button
            type="button"
            onClick={onExit}
            aria-label="Close onboarding"
            className="shrink-0 rounded p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : exitHref ? (
          <a
            href={exitHref}
            aria-label="Close onboarding"
            className="shrink-0 rounded p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <WizardProgress current={current} />

      {/* Sidebar on large screens; single column below. */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 overflow-y-auto border-r border-border-hairline bg-canvas/50 lg:block">
          <WizardStepList current={current} completed={completed} onGo={onGo} />
        </aside>

        <div className="flex min-h-0 flex-col">
          <div
            ref={headingRef}
            tabIndex={-1}
            className="shrink-0 px-4 pt-4 focus:outline-none sm:px-6 sm:pt-5"
          >
            {/* The complete screen carries its own success heading; keep this
                one screen-reader-only so focus and announcements still work
                without a duplicated visible title. */}
            <h1
              className={cn(
                "tracking-tight text-ink",
                isComplete ? "sr-only" : "text-[20px] font-semibold leading-7",
              )}
            >
              {meta.title}
            </h1>
          </div>
          <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3 sm:px-6">
            <div key={current} className="wizard-step-enter">
              {children}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky actions: always visible, never pushed below the fold.
          The complete screen carries its own success action instead. */}
      {footer ? (
        <div className="shrink-0 border-t border-border-hairline bg-surface px-4 py-3.5 sm:px-6">
          {footer}
          {statusLine}
        </div>
      ) : null}
    </div>
  );
}
