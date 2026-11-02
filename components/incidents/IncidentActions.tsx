"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  generateAnalysis,
  runProjectMonitor,
} from "@/app/projects/[id]/incidents/actions";
import type { ActionResult } from "@/app/projects/[id]/incidents/actions";

/**
 * Top-of-incident controls: (re)generate the read-only AI analysis and run an
 * on-demand detection pass. Both call server actions inside a transition and
 * refresh the server component so the page reflects the new DB state.
 *
 * When an incident has no stored analysis (for example, one opened by the
 * unattended monitor), this component asks the server to generate one on first
 * view. The action is idempotent from the user's perspective: once a validated
 * row exists the page renders it and this effect does not run again.
 */
export function IncidentActions({
  projectId,
  incidentId,
  hasAnalysis,
  autoGenerate = true,
}: {
  projectId: string;
  incidentId: string;
  hasAnalysis: boolean;
  autoGenerate?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | "analyze" | "monitor">(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const autoStarted = useRef(false);

  const run = useCallback(
    (which: "analyze" | "monitor", fn: () => Promise<ActionResult>) => {
      setBusy(which);
      setResult(null);
      startTransition(async () => {
        try {
          const res = await fn();
          setResult(res);
          if (res.ok) router.refresh();
        } catch {
          setResult({
            ok: false,
            error: "The operation could not be completed. Please try again.",
          });
        } finally {
          setBusy(null);
        }
      });
    },
    [router],
  );

  useEffect(() => {
    if (!autoGenerate || hasAnalysis || autoStarted.current) return;
    autoStarted.current = true;
    run("analyze", () => generateAnalysis(incidentId, "auto"));
  }, [autoGenerate, hasAnalysis, incidentId, run]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          variant="ai"
          icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          pending={pending && busy === "analyze"}
          disabled={pending}
          onClick={() => run("analyze", () => generateAnalysis(incidentId))}
        >
          {hasAnalysis ? "Re-run AI analysis" : "Generate AI analysis"}
        </ActionButton>
        <ActionButton
          variant="secondary"
          icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          pending={pending && busy === "monitor"}
          disabled={pending}
          onClick={() => run("monitor", () => runProjectMonitor(projectId))}
        >
          Run monitor check now
        </ActionButton>
      </div>
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
