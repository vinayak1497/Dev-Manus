"use client";

import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Field, Hint, SectionCard, inputClass } from "../StepFields";
import { EnvVarImport } from "../EnvVarImport";
import { ProvenanceBadge } from "../ProvenanceBadge";
import { applyImportedValue } from "@/lib/onboarding/dotenv";
import { buildHealthCheckUrl, HEALTH_TARGET_TYPE_LABEL } from "@/lib/onboarding/health";
import type { HealthTargetType } from "@/lib/onboarding/types";
import type { StepProps } from "./StepBasicsRepo";

/** Step 5 — Environment & Secrets. Values never touch git, logs, or storage. */
export function StepEnvironment({
  state,
  setState,
  errors,
  secretValues,
  setSecretValue,
}: StepProps & {
  secretValues: Record<string, string>;
  setSecretValue: (key: string, value: string) => void;
}) {
  const env = state.environment;
  const [showSecrets, setShowSecrets] = useState(false);
  const suggestedNames = state.analysis?.envVarNames ?? [];

  const addVar = () =>
    setState((s) => ({
      ...s,
      environment: { ...s.environment, vars: [...s.environment.vars, { key: "", value: "" }] },
    }));
  const addSecret = () =>
    setState((s) => ({
      ...s,
      environment: {
        ...s.environment,
        secrets: [...s.environment.secrets, { key: "", hasValue: false }],
      },
    }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-ink">
          Environment &amp; secrets
        </h2>
        <p className="mt-1 text-[14px] leading-6 text-ink-secondary">
          Plain configuration above the line, credentials below it. Secret values
          stay in this session — only <strong className="font-medium text-ink">names</strong> are
          saved with the project.
        </p>
      </div>

      <SectionCard
        title="Environment variables"
        description="Non-sensitive configuration such as ports, hosts, and feature flags."
      >
        {errors.vars ? (
          <p role="alert" className="rounded-md border border-critical-border bg-critical-tint px-3 py-2 text-[13px] text-critical">
            {errors.vars}
          </p>
        ) : null}

        <EnvVarImport
          vars={env.vars}
          onAddVariable={addVar}
          onAppend={(added) =>
            setState((s) => ({
              ...s,
              environment: {
                ...s.environment,
                vars: [...s.environment.vars, ...added],
              },
            }))
          }
          onSetValue={(key, value) =>
            setState((s) => ({
              ...s,
              environment: {
                ...s.environment,
                vars: applyImportedValue(s.environment.vars, key, value),
              },
            }))
          }
        />

        {suggestedNames.length > 0 && env.vars.length === 0 ? (
          <button
            type="button"
            onClick={() =>
              setState((s) => ({
                ...s,
                environment: {
                  ...s.environment,
                  vars: suggestedNames.slice(0, 12).map((n) => ({ key: n, value: "" })),
                },
              }))
            }
            className="inline-flex h-9 w-fit items-center rounded border border-border-hairline bg-canvas px-3 text-[13px] font-medium text-ink hover:border-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Import {Math.min(suggestedNames.length, 12)} names from .env.example
          </button>
        ) : null}
        {env.vars.length === 0 ? (
          <Hint>
            No variables yet — add one, import your existing .env file, or skip this
            step.
          </Hint>
        ) : null}
        {env.vars.map((v, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
          >
            <input
              aria-label={`Variable ${i + 1} name`}
              value={v.key}
              placeholder="DATABASE_HOST"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) =>
                setState((s) => {
                  const vars = [...s.environment.vars];
                  vars[i] = { ...vars[i], key: e.target.value.toUpperCase() };
                  return { ...s, environment: { ...s.environment, vars } };
                })
              }
              className="h-10 min-w-0 w-full rounded border border-border-hairline bg-surface px-3 font-mono text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {/* Below `sm` the value keeps the remove button beside it instead of
                clipping; at `sm` the wrapper dissolves so all three become
                grid columns (Design.md 8px rhythm, RULE.md §8). */}
            <div className="flex items-center gap-2 sm:contents">
              <input
                aria-label={`Variable ${i + 1} value`}
                value={v.value}
                placeholder="value"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) =>
                  setState((s) => {
                    const vars = [...s.environment.vars];
                    vars[i] = { ...vars[i], value: e.target.value };
                    return { ...s, environment: { ...s.environment, vars } };
                  })
                }
                className="h-10 min-w-0 w-full rounded border border-border-hairline bg-surface px-3 font-mono text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="button"
                aria-label={`Remove variable ${i + 1}`}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    environment: {
                      ...s.environment,
                      vars: s.environment.vars.filter((_, j) => j !== i),
                    },
                  }))
                }
                className="shrink-0 rounded p-2 text-ink-muted hover:bg-canvas hover:text-critical focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        <Hint>
          Imported values land here as ordinary rows — edit, remove, or add more.
          Anything sensitive belongs in Secrets below, where values stay in this
          session.
        </Hint>
      </SectionCard>

      <SectionCard
        title="Secrets"
        description="API keys, passwords, tokens. Masked by default, never stored in git, never logged."
      >
        {errors.secrets ? (
          <p role="alert" className="rounded-md border border-critical-border bg-critical-tint px-3 py-2 text-[13px] text-critical">
            {errors.secrets}
          </p>
        ) : null}
        {env.secrets.length === 0 ? (
          <Hint>No secrets yet — or skip; you can add them later in Settings → Secrets.</Hint>
        ) : null}
        {env.secrets.map((sec, i) => (
          <div key={i} className="flex items-start gap-2">
            <input
              aria-label={`Secret ${i + 1} name`}
              value={sec.key}
              placeholder="JWT_SECRET"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) =>
                setState((s) => {
                  const secrets = [...s.environment.secrets];
                  secrets[i] = { ...secrets[i], key: e.target.value.toUpperCase() };
                  return { ...s, environment: { ...s.environment, secrets } };
                })
              }
              className="h-10 flex-1 rounded border border-border-hairline bg-surface px-3 font-mono text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <div className="relative flex-1">
              <input
                aria-label={`Secret ${i + 1} value (session only)`}
                type={showSecrets ? "text" : "password"}
                value={secretValues[sec.key] ?? ""}
                placeholder="session only — not saved"
                autoComplete="new-password"
                spellCheck={false}
                onChange={(e) => setSecretValue(sec.key, e.target.value)}
                className="h-10 w-full rounded border border-border-hairline bg-surface px-3 pr-10 font-mono text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="button"
                aria-label={showSecrets ? "Hide secret values" : "Show secret values"}
                onClick={() => setShowSecrets((v) => !v)}
                className="absolute right-1 top-1 rounded p-1.5 text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                {showSecrets ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            <button
              type="button"
              aria-label={`Remove secret ${i + 1}`}
              onClick={() =>
                setState((s) => ({
                  ...s,
                  environment: {
                    ...s.environment,
                    secrets: s.environment.secrets.filter((_, j) => j !== i),
                  },
                }))
              }
              className="rounded p-2 text-ink-muted hover:bg-canvas hover:text-critical focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addSecret}
            className="inline-flex h-9 items-center rounded border border-border-hairline bg-surface px-3 text-[13px] font-medium text-ink hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Add secret
          </button>
          {env.secrets.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowSecrets((v) => !v)}
              className="inline-flex h-9 items-center rounded px-3 text-[13px] font-medium text-ink-secondary hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {showSecrets ? "Hide values" : "Show values"}
            </button>
          ) : null}
        </div>
        <Hint>Only names + “value provided?” are saved. Values never leave this tab.</Hint>
      </SectionCard>
    </div>
  );
}

/** Step 6 — Runtime. Detected values are prefilled but always editable. */
export function StepRuntime({ state, setState, errors }: StepProps) {
  const r = state.runtime;
  const deploymentManaged = state.deployment.strategy === "kubernetes" || state.deployment.strategy === "helm";
  const alternatives = state.analysis?.applicationPort.alternatives ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-ink">
          Runtime configuration
        </h2>
        <p className="mt-1 text-[14px] leading-6 text-ink-secondary">
          How the application builds and runs. Auto-detected rows are marked —
          override anything that looks wrong.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Development command" htmlFor="ob-dev" hint="Optional">
          <input
            id="ob-dev"
            value={r.devCommand}
            placeholder="How developers run it locally"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                runtime: { ...s.runtime, devCommand: e.target.value, devCommandProvenance: "configured" },
              }))
            }
            className={inputClass(false)}
          />
          <ProvenanceBadge provenance={r.devCommandProvenance} />
        </Field>
        <Field label="Build command" htmlFor="ob-build" hint="Optional">
          <input
            id="ob-build"
            value={r.buildCommand}
            placeholder="How its artifact is built"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                runtime: { ...s.runtime, buildCommand: e.target.value, buildProvenance: "configured" },
              }))
            }
            className={inputClass(false)}
          />
          <ProvenanceBadge provenance={r.buildProvenance} />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Production start"
            htmlFor="ob-start"
            error={errors.startCommand}
            required={!deploymentManaged}
            hint={deploymentManaged ? "Optional for deployment-managed workloads" : undefined}
          >
            <input
              id="ob-start"
              value={r.startCommand}
              placeholder={deploymentManaged ? "Deployment-managed — leave empty when the workload starts itself" : "How the deployed workload starts the app"}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  runtime: { ...s.runtime, startCommand: e.target.value, startProvenance: "configured" },
                }))
              }
              className={inputClass(!!errors.startCommand)}
            />
            <ProvenanceBadge provenance={r.startProvenance} />
            <Hint>
              How the deployed workload starts this application — not a command
              Safeguard executes. For Kubernetes or Helm, leave this empty when
              the deployment starts the workload itself. It is kept separate
              from development and build commands on purpose.
            </Hint>
          </Field>
        </div>
        <Field label="Runtime" htmlFor="ob-runtime" hint="Optional">
          <input
            id="ob-runtime"
            value={r.runtime}
            placeholder="Detected language or runtime"
            autoComplete="off"
            onChange={(e) =>
              setState((s) => ({
                ...s,
                runtime: { ...s.runtime, runtime: e.target.value, runtimeProvenance: "configured" },
              }))
            }
            className={inputClass(false)}
          />
          <ProvenanceBadge provenance={r.runtimeProvenance} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Port" htmlFor="ob-port" error={errors.port} hint="Optional">
            <input
              id="ob-port"
              value={r.port}
              inputMode="numeric"
              placeholder="Application port"
              autoComplete="off"
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  runtime: { ...s.runtime, port: e.target.value.replace(/[^0-9]/g, ""), portProvenance: "configured" },
                }))
              }
              className={inputClass(!!errors.port)}
            />
            <ProvenanceBadge provenance={r.portProvenance} />
            {alternatives.length > 0 && !r.port ? (
              <Hint>
                Multiple equally strong application ports were found (
                {alternatives.map((finding) => `${finding.port} from ${finding.evidence.sourcePath}`).join("; ")}
                ). Choose the actual application listener.
              </Hint>
            ) : null}
          </Field>
          <Field label="Protocol" htmlFor="ob-proto">
            <select
              id="ob-proto"
              value={r.protocol}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  runtime: { ...s.runtime, protocol: e.target.value as typeof r.protocol },
                }))
              }
              className={inputClass(false)}
            >
              <option value="HTTP">HTTP</option>
              <option value="HTTPS">HTTPS</option>
              <option value="TCP">TCP</option>
            </select>
          </Field>
        </div>
      </div>

      <Field label="Root directory" htmlFor="ob-root" hint="Optional — monorepos">
        <input
          id="ob-root"
          value={r.rootDirectory}
          placeholder="./  (or packages/api)"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) =>
            setState((s) => ({ ...s, runtime: { ...s.runtime, rootDirectory: e.target.value } }))
          }
          className={inputClass(false)}
        />
      </Field>
    </div>
  );
}
