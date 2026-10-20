import { Check } from "lucide-react";
import { WIZARD_STEPS, WIZARD_STEP_META, type WizardStepId } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

type ProgressProps = {
  current: WizardStepId;
  completed: Set<WizardStepId>;
  onGo: (step: WizardStepId) => void;
};

/**
 * Slim progress line rendered under the wizard header at every size.
 * Purely proportional — it never claims a step is complete; completion state
 * lives in the step list and in validation, not in this bar.
 */
export function WizardProgress({ current }: Pick<ProgressProps, "current">) {
  const currentIdx = WIZARD_STEP_META[current].index;
  const total = WIZARD_STEPS.length;
  return (
    <div
      className="h-[3px] w-full bg-subtle"
      role="progressbar"
      aria-valuenow={currentIdx + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Onboarding progress: step ${currentIdx + 1} of ${total}, ${WIZARD_STEP_META[current].title}`}
    >
      <div
        className="h-full rounded-r bg-brand transition-[width] duration-200 ease-out"
        style={{ width: `${((currentIdx + 1) / total) * 100}%` }}
      />
    </div>
  );
}

/**
 * Full step list for the wizard sidebar (large screens only).
 *
 * States come straight from the parent's validation-derived `completed` set:
 * done = the step validates clean today; current = where you are; todo =
 * everything else. No decorative completion is ever shown — a visited step
 * that fails validation still reads as todo. Forward jumps are validated by
 * the parent's `onGo`, exactly as before; this component only renders.
 */
export function WizardStepList({ current, completed, onGo }: ProgressProps) {
  const currentIdx = WIZARD_STEP_META[current].index;
  const total = WIZARD_STEPS.length;
  return (
    <nav aria-label="Onboarding steps" className="h-full">
      <p className="px-4 pb-2 pt-4 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        Setup · {currentIdx + 1}/{total}
      </p>
      <ol className="flex flex-col gap-0.5 px-2 pb-4">
        {WIZARD_STEPS.map((id) => {
          const meta = WIZARD_STEP_META[id];
          const done = completed.has(id);
          const isCurrent = id === current;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onGo(id)}
                disabled={isCurrent || id === "complete"}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Step ${meta.index + 1} of ${total}: ${meta.title}${
                  done ? " (complete)" : isCurrent ? " (current step)" : ""
                }`}
                title={`${meta.index + 1}. ${meta.title}`}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                  isCurrent
                    ? "bg-brand-light/60"
                    : "hover:bg-subtle",
                  id === "complete" && !done ? "cursor-default" : "",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold transition-colors",
                    done
                      ? "border-success bg-success text-white"
                      : isCurrent
                        ? "border-brand bg-brand text-white"
                        : "border-border bg-surface text-ink-muted",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : meta.index + 1}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate text-[13px]",
                    isCurrent ? "font-semibold text-ink" : done ? "font-medium text-ink" : "text-ink-secondary",
                  )}
                >
                  {meta.short}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
