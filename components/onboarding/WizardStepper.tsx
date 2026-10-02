import { Check } from "lucide-react";
import { WIZARD_STEPS, WIZARD_STEP_META, type WizardStepId } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

/**
 * Stepper / progress indicator — one journey, ten visible stations.
 * Compact progress bar on small screens, full station list on md+.
 * Completed = check + label; current = brand ring; future = muted.
 * Buttons are keyboard-focusable; future jump is validated by the parent.
 */
export function WizardStepper({
  current,
  completed,
  onGo,
}: {
  current: WizardStepId;
  completed: Set<WizardStepId>;
  onGo: (step: WizardStepId) => void;
}) {
  const currentIdx = WIZARD_STEP_META[current].index;
  const total = WIZARD_STEPS.length;

  return (
    <nav aria-label="Onboarding progress" className="w-full">
      {/* Compact: step X of 10 + bar */}
      <div className="md:hidden">
        <p className="text-[13px] font-medium text-ink-secondary" aria-live="polite">
          Step {currentIdx + 1} of {total} — {WIZARD_STEP_META[current].title}
        </p>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded bg-subtle"
          role="progressbar"
          aria-valuenow={currentIdx + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full rounded bg-brand transition-all"
            style={{ width: `${((currentIdx + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Full stepper */}
      <ol className="hidden gap-1 md:flex">
        {WIZARD_STEPS.map((id) => {
          const meta = WIZARD_STEP_META[id];
          const done = completed.has(id);
          const isCurrent = id === current;
          const isPast = meta.index < currentIdx;
          return (
            <li key={id} className={cn("min-w-0 flex-1", isCurrent && "flex-[3]")}>
              <button
                type="button"
                onClick={() => onGo(id)}
                disabled={isCurrent || id === "complete"}
                aria-current={isCurrent ? "step" : undefined}
                // Ten stations cannot each hold a full word at this width, so
                // only the ACTIVE step shows its name (with extra width for
                // it). Every station still exposes the complete step name to
                // assistive tech and on hover — nobody is ever told "D…".
                aria-label={`Step ${meta.index + 1} of ${total}: ${meta.title}${
                  done ? " (complete)" : isCurrent ? " (current step)" : ""
                }`}
                title={`${meta.index + 1}. ${meta.title}`}
                className={cn(
                  "flex w-full flex-col gap-1.5 rounded-md px-2 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                  isCurrent ? "bg-brand-light/60" : "hover:bg-subtle",
                  id === "complete" && !done ? "cursor-default" : "",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold",
                      done || isPast
                        ? "border-success bg-success text-white"
                        : isCurrent
                          ? "border-brand bg-brand text-white"
                          : "border-border bg-surface text-ink-muted",
                    )}
                  >
                    {done || isPast ? <Check className="h-3 w-3" /> : meta.index + 1}
                  </span>
                  <span
                    className={cn(
                      "truncate text-[12px] font-medium",
                      isCurrent ? "block text-ink" : "hidden",
                    )}
                  >
                    {meta.title}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1 rounded",
                    done || isPast ? "bg-success" : isCurrent ? "bg-brand" : "bg-subtle",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
