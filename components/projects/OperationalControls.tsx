"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  CheckCircle2,
  FlaskConical,
  RefreshCw,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  runProjectMonitor,
  setupDemoScenario,
  simulateControlledFailure,
} from "@/app/projects/[id]/incidents/actions";
import { runConfiguredHttpCheck } from "@/app/projects/[id]/health-actions";
import type { ActionResult } from "@/app/projects/[id]/incidents/actions";

/**
 * Operational controls on the project dashboard. "Run monitor check" runs one
 * real detection pass in any environment. The demo controls (set up services,
 * simulate a controlled failure) are dev/demo only and clearly labelled — the
 * simulation writes an unhealthy OBSERVATION and lets detection decide, so the
 * flow stays OBSERVE → DETECT, never BUTTON → INCIDENT.
 */
export function OperationalControls({
  projectId,
  devMode,
  canRunConfiguredCheck,
}: {
  projectId: string;
  devMode: boolean;
  /** True when onboarding stored an HTTP target + endpoint for this project. */
  canRunConfiguredCheck: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [op, setOp] = useState<null | "setup" | "simulate" | "monitor" | "http">(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (
    which: "setup" | "simulate" | "monitor" | "http",
    fn: () => Promise<ActionResult>,
  ) => {
    setOp(which);
    setResult(null);
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      setOp(null);
      if (res.ok) {
        router.refresh();
        if ((which === "simulate" || which === "http") && res.incidentId) {
          router.push(`/projects/${projectId}/incidents/${res.incidentId}`);
        }
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          variant="secondary"
          icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          pending={pending && op === "monitor"}
          disabled={pending}
          onClick={() => run("monitor", () => runProjectMonitor(projectId))}
        >
          Run monitor check
        </ActionButton>
        {canRunConfiguredCheck ? (
          <ActionButton
            variant="secondary"
            icon={<Zap className="h-4 w-4" aria-hidden="true" />}
            pending={pending && op === "http"}
            disabled={pending}
            onClick={() => run("http", () => runConfiguredHttpCheck(projectId))}
          >
            Run HTTP check
          </ActionButton>
        ) : null}
        <span className="text-[12px] text-ink-muted">
          {canRunConfiguredCheck
            ? "Runs the configured HTTP check now and records the result."
            : "Runs one real detection pass over this project now."}
        </span>
      </div>

      {devMode ? (
        <div className="flex flex-col gap-3 rounded-md border border-ai-border bg-ai-tint p-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 shrink-0 text-ai" aria-hidden="true" />
            <h3 className="text-[13px] font-semibold text-ink">
              Demo / Controlled Simulation
            </h3>
          </div>
          <p className="text-[12px] leading-5 text-ink-secondary">
            Development only. These create clearly-labelled sample services and
            record a controlled unhealthy signal on the demo{" "}
            <code className="font-mono text-[11px]">api</code> service. Detection
            independently observes the signal and opens an incident — the button
            never creates one directly.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              variant="secondary"
              icon={<Boxes className="h-4 w-4" aria-hidden="true" />}
              pending={pending && op === "setup"}
              disabled={pending}
              onClick={() => run("setup", () => setupDemoScenario(projectId))}
            >
              Set up demo services
            </ActionButton>
            <ActionButton
              variant="secondary"
              icon={<Zap className="h-4 w-4" aria-hidden="true" />}
              pending={pending && op === "simulate"}
              disabled={pending}
              onClick={() =>
                run("simulate", () => simulateControlledFailure(projectId))
              }
            >
              Simulate controlled failure
            </ActionButton>
          </div>
        </div>
      ) : null}

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={`inline-flex items-start gap-1.5 text-[12px] leading-5 ${
            result.ok ? "text-ink-secondary" : "text-critical"
          }`}
        >
          {result.ok ? (
            <CheckCircle2
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
              aria-hidden="true"
            />
          ) : (
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          {result.ok ? result.message : result.error}
        </p>
      ) : null}
    </div>
  );
}
