"use client";

import { useRef, useState } from "react";
import { FileText, Loader, Plus, TriangleAlert, Upload } from "lucide-react";
import {
  ISSUE_MESSAGE,
  mergeEnvVars,
  parseEnvSource,
  summarizeImport,
  type EnvConflict,
  type ParseIssue,
} from "@/lib/onboarding/dotenv";
import type { EnvVar } from "@/lib/onboarding/types";

/** Guards against a pathological file freezing the tab. */
const MAX_BYTES = 256 * 1024;

type Feedback =
  | { kind: "imported"; fileName: string; added: number; skipped: number }
  | { kind: "error"; message: string }
  | null;

/**
 * The two ways to get variables into this project — type them, or bring an
 * existing `.env` across.
 *
 * Privacy (RULE.md §10, §24): the file is read with the browser File API and
 * parsed in memory by `lib/onboarding/dotenv`. It is never uploaded, never
 * logged, never sent to analytics, and no value is ever written into a
 * message. Nothing is persisted here beyond what the existing wizard draft
 * already stores for manually typed variables.
 */
export function EnvVarImport({
  vars,
  onAddVariable,
  onAppend,
  onSetValue,
}: {
  vars: EnvVar[];
  onAddVariable: () => void;
  onAppend: (added: EnvVar[]) => void;
  onSetValue: (key: string, value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [conflicts, setConflicts] = useState<EnvConflict[]>([]);
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [showIssues, setShowIssues] = useState(false);

  const reset = () => {
    setFeedback(null);
    setConflicts([]);
    setIssues([]);
    setShowIssues(false);
  };

  const handleFile = async (file: File) => {
    reset();
    if (file.size > MAX_BYTES) {
      setFeedback({
        kind: "error",
        message: "That file is larger than 256 KB. Split it or add the variables manually.",
      });
      return;
    }

    setBusy(true);
    // Yield once so the parsing state paints before we block on parsing.
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const text = await file.text();
      const parsed = parseEnvSource(text);

      if (parsed.vars.length === 0 && parsed.issues.length === 0) {
        setFeedback({
          kind: "error",
          message: "This .env file doesn’t contain any environment variables.",
        });
        return;
      }

      const merge = mergeEnvVars(vars, parsed);

      if (merge.added.length === 0 && merge.conflicts.length === 0) {
        setFeedback({
          kind: "error",
          message: "No usable variables were found in that file.",
        });
        return;
      }

      if (merge.added.length > 0) onAppend(merge.added);
      setConflicts(merge.conflicts);
      setIssues(merge.issues);
      setShowIssues(merge.issues.length > 0);
      setFeedback({
        kind: "imported",
        fileName: file.name,
        added: merge.added.length,
        skipped: merge.issues.length,
      });
    } catch {
      // Never surface the raw exception — it can quote file content.
      setFeedback({ kind: "error", message: "This file could not be read. Try again." });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const chooseImported = (conflict: EnvConflict) => {
    onSetValue(conflict.key, conflict.importedValue);
    setConflicts((list) => list.filter((c) => c.key !== conflict.key));
  };

  const keepExisting = (conflict: EnvConflict) => {
    setConflicts((list) => list.filter((c) => c.key !== conflict.key));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAddVariable}
          disabled={busy}
          className="inline-flex h-9 items-center rounded border border-border-hairline bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Add variable
        </button>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          // Dotenv files are frequently named `.env.local`, `.env.production`, …
          // so the picker is not restricted by extension; a non-dotenv file is
          // simply reported as containing no usable variables.
          accept=".env,.env.*,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-describedby="env-import-hint"
          className="inline-flex h-9 items-center rounded border border-transparent px-3 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-canvas hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
        >
          {busy ? (
            <Loader className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
          {busy ? "Importing environment variables…" : "Import .env"}
        </button>
        <span id="env-import-hint" className="sr-only">
          Reads a dotenv file from this device and fills the fields below. The file is
          never uploaded.
        </span>
      </div>

      <div aria-live="polite">
        {busy ? null : feedback?.kind === "error" ? (
          <p
            role="alert"
            className="rounded-md border border-critical-border bg-critical-tint px-3 py-2 text-[13px] text-critical"
          >
            {feedback.message}
          </p>
        ) : feedback?.kind === "imported" ? (
          <p className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Imported from {feedback.fileName} ·{" "}
              {summarizeImport(feedback.added, conflicts.length, feedback.skipped)}
            </span>
          </p>
        ) : null}
      </div>

      {conflicts.length > 0 ? (
        <div className="rounded-md border border-warning-border bg-warning-tint px-3 py-2.5">
          <p className="text-[13px] font-medium text-ink">
            {conflicts.length === 1
              ? "1 name already exists"
              : `${conflicts.length} names already exist`}
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-ink-secondary">
            Your current value was kept. Choose what to use for each.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {conflicts.map((c) => (
              <li
                key={c.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface/70 px-2 py-1.5"
              >
                <span className="font-mono text-[12px] text-ink">{c.key}</span>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => keepExisting(c)}
                    className="rounded border border-border-hairline bg-surface px-2 py-1 text-[12px] font-medium text-ink-secondary hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    Keep existing
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseImported(c)}
                    className="rounded border border-brand bg-brand px-2 py-1 text-[12px] font-medium text-white hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    Use imported
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div className="rounded-md border border-border-hairline bg-canvas px-3 py-2.5">
          <button
            type="button"
            onClick={() => setShowIssues((v) => !v)}
            aria-expanded={showIssues}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-secondary hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            {issues.length === 1
              ? "1 entry couldn’t be imported"
              : `${issues.length} entries couldn’t be imported`}
            <span className="font-normal text-ink-muted">
              {showIssues ? "Hide" : "Show"}
            </span>
          </button>
          {showIssues ? (
            <ul className="mt-2 flex flex-col gap-1">
              {issues.map((issue) => (
                <li key={`${issue.line}-${issue.reason}`} className="text-[12px] leading-5 text-ink-secondary">
                  Line {issue.line}
                  {issue.key ? ` (${issue.key})` : ""} — {ISSUE_MESSAGE[issue.reason]}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}