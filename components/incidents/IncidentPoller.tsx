"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { runProjectMonitor } from "@/app/projects/[id]/incidents/actions";

/**
 * Gentle client-side polling (§21). While an incident is active and the tab is
 * visible, it runs one detection pass every `intervalMs` and refreshes the
 * server component, so verification progress and recovery appear without a
 * manual reload. It stops entirely once the incident is resolved, and never
 * runs while the tab is hidden — no busy-looping in a background tab.
 */
export function IncidentPoller({
  projectId,
  active,
  intervalMs = 8000,
}: {
  projectId: string;
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [lastRun, setLastRun] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(run, intervalMs);
    };
    const run = async () => {
      if (document.visibilityState !== "visible" || busy.current) {
        schedule();
        return;
      }
      busy.current = true;
      try {
        await runProjectMonitor(projectId);
        router.refresh();
        setLastRun(Date.now());
      } catch {
        // Transient failure — try again on the next interval.
      } finally {
        busy.current = false;
        schedule();
      }
    };

    schedule();
    return () => clearTimeout(timer);
  }, [active, projectId, intervalMs, router]);

  if (!active) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-secondary"
      role="status"
    >
      <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" aria-hidden="true" />
      Live — auto-checking every {Math.round(intervalMs / 1000)}s
      {lastRun ? <span className="sr-only">Last checked just now</span> : null}
    </span>
  );
}
