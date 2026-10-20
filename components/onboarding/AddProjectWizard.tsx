"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader } from "lucide-react";
import { createProjectFromOnboarding } from "@/app/projects/actions";
import {
  WIZARD_STEPS,
  WIZARD_STEP_META,
  emptyWizardState,
  toSubmitPayload,
  type RepoAnalysis,
  type WizardState,
  type WizardStepId,
} from "@/lib/onboarding/types";
import {
  applyAnalysisSuggestions,
  canonicalSubmitSections,
} from "@/lib/onboarding/configuration";
import {
  clearDraft,
  loadDraft,
  loadSecretValues,
  saveDraft,
  saveSecretValues,
} from "@/lib/onboarding/storage";
import { validateStep } from "@/lib/onboarding/validation";
import { WizardShell } from "./WizardShell";
import { StepBasics, StepRepository } from "./steps/StepBasicsRepo";
import { StepAnalysis, StepDeployment } from "./steps/StepAnalysisDeploy";
import { StepEnvironment, StepRuntime } from "./steps/StepEnvRuntime";
import { StepDependencies, StepHealth } from "./steps/StepDepsHealth";
import { StepComplete, StepReview } from "./steps/StepReviewComplete";
import { cn } from "@/lib/utils";

type Props = {
  initial?: WizardState | null;
  /** Called once, after the server confirms exactly one project. */
  onComplete?: (projectId: string) => void;
  onExit?: () => void;
  /** Full-page mode hides the modal close button. */
  embedded?: boolean;
  /** Full-page close target (the dialog uses onExit instead). */
  exitHref?: string;
};

function stepIndex(id: WizardStepId): number {
  return WIZARD_STEP_META[id].index;
}

/**
 * Add Project onboarding wizard — ONE journey across ten steps.
 *
 * - Single state object, so Back never loses data.
 * - Each Continue validates its step; Review validates everything.
 * - Analysis runs once per URL and later steps adapt to its findings.
 * - Review → Start Monitoring creates the project exactly once (server
 *   idempotent on draftId); nothing is created during navigation.
 * - Draft survives refresh via localStorage (secret VALUES excluded).
 */
export function AddProjectWizard({ initial, onComplete, onExit, embedded, exitHref }: Props) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(
    () => initial ?? loadDraft() ?? emptyWizardState(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [secretValues, setSecretValues] = useState<Record<string, string>>(() =>
    loadSecretValues(),
  );
  const analyzedFor = useRef<string>("");
  const headingRef = useRef<HTMLDivElement>(null);

  const current = state.createdProjectId ? "complete" : state.currentStep;
  const idx = stepIndex(current);

  // Persist the draft (secret values excluded by storage.ts).
  useEffect(() => {
    if (!state.createdProjectId) saveDraft(state);
  }, [state]);

  useEffect(() => {
    saveSecretValues(secretValues);
  }, [secretValues]);

  const setSecretValue = useCallback((key: string, value: string) => {
    setSecretValues((prev) => ({ ...prev, [key]: value }));
    // Mark presence so Review shows "(value set)" honestly.
    if (key.trim()) {
      setState((s) => ({
        ...s,
        environment: {
          ...s.environment,
          secrets: s.environment.secrets.map((sec) =>
            sec.key === key ? { ...sec, hasValue: value.length > 0 } : sec,
          ),
        },
      }));
    }
  }, []);

  const applyAnalysis = useCallback((analysis: RepoAnalysis) => {
    setState((s) => applyAnalysisSuggestions(s, analysis));
  }, []);

  const runAnalysis = useCallback(async () => {
    const url = state.repository.url.trim();
    const branch = state.repository.branch.trim() || "main";
    if (!url) {
      setState((s) => ({ ...s, analysisStatus: "unavailable", analysis: null }));
      return;
    }
    setState((s) => ({ ...s, analysisStatus: "analyzing", analysisError: null }));
    try {
      const res = await fetch("/api/onboarding/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repositoryUrl: url, branch }),
      });
      const json = (await res.json()) as
        | { ok: true; analysis: RepoAnalysis }
        | { ok: false; error: string };
      if (!res.ok || json.ok !== true) {
        setState((s) => ({
          ...s,
          analysisStatus: "unavailable",
          analysisError:
            (json as { error?: string }).error ?? "Analysis failed. Continue manually.",
        }));
        return;
      }
      analyzedFor.current = `${url}@${branch}`;
      applyAnalysis(json.analysis);
    } catch {
      setState((s) => ({
        ...s,
        analysisStatus: "unavailable",
        analysisError: "The analysis request failed. Continue with manual configuration.",
      }));
    }
  }, [state.repository.url, state.repository.branch, applyAnalysis]);

  // Auto-run once when the analysis step is first shown with a URL.
  useEffect(() => {
    if (current !== "analysis") return;
    const url = state.repository.url.trim();
    if (!url) return;
    const key = `${url}@${state.repository.branch.trim() || "main"}`;
    if (state.analysisStatus === "idle" && analyzedFor.current !== key) {
      analyzedFor.current = key; // guard StrictMode double-effect
      void runAnalysis();
    }
  }, [current, state.repository.url, state.repository.branch, state.analysisStatus, runAnalysis]);

  // Focus the step on change (screen-reader + keyboard users).
  useEffect(() => {
    headingRef.current?.focus();
  }, [current]);

  const completed = useMemo(() => {
    const done = new Set<WizardStepId>();
    for (const id of WIZARD_STEPS) {
      if (id === "complete" || id === "review" || id === "analysis") continue;
      if (Object.keys(validateStep(id, state)).length === 0) done.add(id);
    }
    if (state.analysisStatus === "ready" || state.analysisStatus === "unavailable")
      done.add("analysis");
    if (state.createdProjectId) done.add("review");
    return done;
  }, [state]);

  const goTo = useCallback(
    (target: WizardStepId) => {
      if (target === "complete") return; // only via submit
      const tIdx = stepIndex(target);
      if (tIdx > idx) {
        // Forward motion validates the current step; jumping to Review
        // validates the whole path and lands on the first problem.
        if (target === "review") {
          for (const id of WIZARD_STEPS) {
            if (id === "review" || id === "complete" || id === "analysis") continue;
            const errs = validateStep(id, state);
            if (Object.keys(errs).length > 0) {
              setState((s) => ({ ...s, currentStep: id }));
              setErrors(errs);
              return;
            }
          }
          setErrors({});
          setState((s) => ({ ...s, currentStep: target }));
          return;
        }
        const errs = validateStep(current, state);
        if (Object.keys(errs).length > 0) {
          setErrors(errs);
          return;
        }
      }
      setErrors({});
      setSubmitError(null);
      setState((s) => ({ ...s, currentStep: target }));
    },
    [current, idx, state],
  );

  const next = useCallback(() => {
    const order = WIZARD_STEPS.filter((s) => s !== "complete");
    const nextId = order[idx + 1];
    if (nextId) goTo(nextId);
  }, [goTo, idx]);

  const back = useCallback(() => {
    const order = WIZARD_STEPS.filter((s) => s !== "complete");
    const prevId = order[idx - 1];
    if (prevId) {
      setErrors({});
      setSubmitError(null);
      setState((s) => ({ ...s, currentStep: prevId }));
    }
  }, [idx]);

  const submit = useCallback(async () => {
    if (isSubmitting) return;
    // Final gate: every step must validate before anything is created.
    for (const id of WIZARD_STEPS) {
      if (id === "review" || id === "complete" || id === "analysis") continue;
      const errs = validateStep(id, state);
      if (Object.keys(errs).length > 0) {
        setState((s) => ({ ...s, currentStep: id }));
        setErrors(errs);
        return;
      }
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const payload = { ...toSubmitPayload(state), ...canonicalSubmitSections(state) };
      const result = await createProjectFromOnboarding(payload);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      clearDraft();
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem("dsg-onboarding-secret-values-v1");
        } catch {
          // ignore
        }
      }
      setState((s) => ({
        ...s,
        createdProjectId: result.projectId,
        currentStep: "complete",
      }));
      onComplete?.(result.projectId);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, state, onComplete, router]);

  const showNav = current !== "complete" && current !== "review";

  const backButton = (
    <button
      type="button"
      onClick={back}
      disabled={idx === 0}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded border border-border-hairline bg-surface px-4 text-[14px] font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-40",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
      )}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </button>
  );

  const continueButton = (
    <button
      type="button"
      onClick={next}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded bg-brand px-5 text-[14px] font-semibold text-white shadow-md transition-all hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      Continue
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  // The review step's primary action lives in the footer like every other
  // step — same handler, same states, same labels as the button that used to
  // sit inside the scrollable summary.
  const startMonitoringButton = (
    <button
      type="button"
      onClick={submit}
      disabled={isSubmitting}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded bg-brand px-5 text-[14px] font-semibold text-white shadow-md transition-all hover:bg-brand-hover disabled:cursor-wait disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      {isSubmitting ? (
        <>
          <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
          Creating project…
        </>
      ) : (
        "Start Monitoring"
      )}
    </button>
  );

  const footer = showNav ? (
    <div className="flex items-center justify-between gap-2">
      {backButton}
      <div className="flex min-w-0 items-center gap-2">
        {current === "repository" && !state.repository.url.trim() ? (
          <span className="hidden truncate text-[12px] text-ink-muted sm:inline">
            No URL needed — Continue works.
          </span>
        ) : null}
        {current === "environment" ? (
          <button
            type="button"
            onClick={next}
            className="shrink-0 rounded px-3 py-2 text-[14px] font-medium text-ink-secondary hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Skip for now
          </button>
        ) : null}
        {continueButton}
      </div>
    </div>
  ) : current === "review" ? (
    <div className="flex items-center justify-between gap-2">
      {backButton}
      {startMonitoringButton}
    </div>
  ) : null;

  const statusLine = isSubmitting ? (
    <p className="mt-2 inline-flex items-center gap-2 text-[13px] text-ink-secondary" role="status">
      <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
      Saving configuration…
    </p>
  ) : null;

  return (
    <WizardShell
      mode={embedded ? "page" : "dialog"}
      current={current}
      completed={completed}
      onGo={goTo}
      headingRef={headingRef}
      onExit={!embedded ? onExit : undefined}
      exitHref={embedded ? exitHref : undefined}
      footer={footer}
      statusLine={statusLine}
    >
      {current === "basics" ? (
        <StepBasics state={state} setState={setState} errors={errors} />
      ) : current === "repository" ? (
        <StepRepository state={state} setState={setState} errors={errors} />
      ) : current === "analysis" ? (
        <StepAnalysis state={state} setState={setState} errors={errors} onAnalyze={runAnalysis} />
      ) : current === "deployment" ? (
        <StepDeployment state={state} setState={setState} errors={errors} />
      ) : current === "environment" ? (
        <StepEnvironment
          state={state}
          setState={setState}
          errors={errors}
          secretValues={secretValues}
          setSecretValue={setSecretValue}
        />
      ) : current === "runtime" ? (
        <StepRuntime state={state} setState={setState} errors={errors} />
      ) : current === "dependencies" ? (
        <StepDependencies state={state} setState={setState} errors={errors} />
      ) : current === "health" ? (
        <StepHealth state={state} setState={setState} errors={errors} />
      ) : current === "review" ? (
        <StepReview
          state={state}
          onEdit={goTo}
          submitError={submitError}
        />
      ) : state.createdProjectId ? (
        <StepComplete state={state} projectId={state.createdProjectId} />
      ) : null}
    </WizardShell>
  );
}
