"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database, FlaskConical, Loader } from "lucide-react";

type Result = { ok: boolean; message: string; created?: number; details?: string[] };

/**
 * Development-only helper for creating/removing sample projects.
 *
 * Rendered only when NODE_ENV !== "production" and it is not a no-op in
 * production: the underlying route answers 404 there. Sample rows are
 * written with is_demo = true so the UI labels them (RULE.md §9.1).
 */
export function DemoDataControls() {
  const router = useRouter();
  const [busy, setBusy] = useState<"seed" | "reset" | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async (action: "seed" | "reset") => {
    if (busy) return;
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch("/api/dev/seed", {
        method: action === "seed" ? "POST" : "DELETE",
      });
      const body = (await response.json()) as Result;
      setResult(body);
      if (body.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "The request failed. Is the app running?" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border border-dashed border-border bg-canvas p-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink-secondary">
        <FlaskConical className="h-4 w-4 text-ai" aria-hidden="true" />
        Development helpers
        <span className="font-mono text-[12px] font-normal text-ink-muted">
          (development only)
        </span>
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("seed")}
          disabled={busy !== null}
          className="inline-flex h-9 items-center gap-2 rounded border border-border-hairline bg-surface px-3 text-[13px] font-medium text-ink shadow-card transition-colors hover:bg-subtle disabled:cursor-wait disabled:opacity-60"
        >
          {busy === "seed" ? (
            <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Database className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          )}
          {busy === "seed" ? "Seeding…" : "Load 6 sample projects"}
        </button>
        <button
          type="button"
          onClick={() => run("reset")}
          disabled={busy !== null}
          className="inline-flex h-9 items-center gap-2 rounded border border-border-hairline bg-surface px-3 text-[13px] font-medium text-ink shadow-card transition-colors hover:bg-subtle disabled:cursor-wait disabled:opacity-60"
        >
          {busy === "reset" ? (
            <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Database className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          )}
          {busy === "reset" ? "Removing…" : "Remove sample data"}
        </button>
      </div>

      {result ? (
        <p
          role="status"
          className={`mt-2 text-[13px] leading-5 ${
            result.ok ? "text-success" : "text-critical"
          }`}
        >
          {result.message}
          {result.details?.length ? (
            <span className="mt-1 block font-mono text-[12px] text-ink-secondary">
              {result.details.join(" · ")}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
