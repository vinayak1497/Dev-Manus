import { Plus, Trash2 } from "lucide-react";
import type { DependencyStatus } from "@/lib/onboarding/types";
import { Field, FieldGroup, Hint, OptionCard, OptionCardText, inputClass } from "../StepFields";
import { DependencyBadge, ProvenanceBadge } from "../ProvenanceBadge";
import { buildHealthCheckUrl, HEALTH_TARGET_TYPE_LABEL } from "@/lib/onboarding/health";
import type { HealthTargetType } from "@/lib/onboarding/types";
import type { StepProps } from "./StepBasicsRepo";

const DBS: { key: "postgres" | "mysql" | "mongodb" | "redis"; label: string; desc: string }[] = [
  { key: "postgres", label: "PostgreSQL", desc: "Relational database" },
  { key: "mysql", label: "MySQL", desc: "Relational database" },
  { key: "mongodb", label: "MongoDB", desc: "Document database" },
  { key: "redis", label: "Redis", desc: "Cache / queue" },
];

const STATUS_CYCLE: DependencyStatus[] = ["detected", "configured", "not_detected", "unknown"];

/** Step 7 — Dependencies & Database. Honest states, no package-name guessing. */
export function StepDependencies({ state, setState }: StepProps) {
  const d = state.dependencies;
  const findings = state.analysis?.status === "ready" ? state.analysis.dependencyFindings : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-6 text-ink-secondary">
        Confirm what the application depends on. Detection comes from
        manifests and compose files — a package name alone never proves a
        live dependency.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DBS.map((db) => {
          const status = d[db.key];
          const summary = findings?.[db.key]?.summary;
          return (
            <button
              key={db.key}
              type="button"
              onClick={() =>
                setState((s) => {
                  const next =
                    STATUS_CYCLE[(STATUS_CYCLE.indexOf(s.dependencies[db.key]) + 1) % STATUS_CYCLE.length];
                  return { ...s, dependencies: { ...s.dependencies, [db.key]: next } };
                })
              }
              aria-label={`${db.label}: ${status}. Activate to change.`}
              className="flex items-center justify-between gap-3 rounded-md border border-border-hairline bg-surface p-3 text-left hover:border-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <span>
                <span className="block text-[14px] font-semibold text-ink">{db.label}</span>
                <span className="block text-[12px] text-ink-muted">{summary ?? `${db.desc} — tap to change`}</span>
              </span>
              <DependencyBadge status={status} />
            </button>
          );
        })}
      </div>

      <FieldGroup title="External APIs" description="Third-party services the app calls (optional).">
        <ApiList
          values={d.externalApis}
          placeholder="api.stripe.com"
          onChange={(v) => setState((s) => ({ ...s, dependencies: { ...s.dependencies, externalApis: v } }))}
        />
      </FieldGroup>

      <FieldGroup title="Queues & caches" description="Message systems beyond Redis (optional).">
        <ApiList
          values={d.queues}
          placeholder="NATS subject, SQS queue…"
          onChange={(v) => setState((s) => ({ ...s, dependencies: { ...s.dependencies, queues: v } }))}
        />
      </FieldGroup>

      <Field label="Notes" htmlFor="ob-depnotes2" hint="Optional">
        <input
          id="ob-depnotes2"
          value={d.notes}
          maxLength={200}
          placeholder="Anything else the team should know"
          onChange={(e) => setState((s) => ({ ...s, dependencies: { ...s.dependencies, notes: e.target.value } }))}
          className={inputClass(false)}
        />
      </Field>
    </div>
  );
}

function ApiList({
  values,
  placeholder,
  onChange,
}: {
  values: string[];
  placeholder: string;
  onChange: (v: string[]) => void;
}) {
  if (values.length === 0) {
    return (
      <button
        type="button"
        onClick={() => onChange([""])}
        className="inline-flex h-9 w-fit items-center rounded border border-border-hairline bg-surface px-3 text-[13px] font-medium text-ink hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Add entry
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            aria-label={`Entry ${i + 1}`}
            value={v}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              const next = [...values];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="h-10 flex-1 rounded border border-border-hairline bg-surface px-3 font-mono text-[13px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="button"
            aria-label={`Remove entry ${i + 1}`}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="rounded p-2 text-ink-muted hover:bg-canvas hover:text-critical focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ""])}
        className="inline-flex h-9 w-fit items-center rounded border border-border-hairline bg-surface px-3 text-[13px] font-medium text-ink hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        Add another
      </button>
    </div>
  );
}

/** Step 8 — Health Monitoring. Explains what each method actually verifies. */
export function StepHealth({ state, setState, errors }: StepProps) {
  const h = state.health;
  const check = buildHealthCheckUrl(h.targetUrl, h.endpoint);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-6 text-ink-secondary">
        How the platform will know the application is alive. Pick what
        actually exists — port checks are honest when there is no endpoint.
      </p>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Check method">
        {(
          [
            { id: "http", t: "HTTP endpoint", d: "Verifies the app answers with the expected status." },
            { id: "port", t: "Port check", d: "Verifies something listens on the port." },
            { id: "container", t: "Container check", d: "Verifies the container/process stays running." },
          ] as const
        ).map((m) => {
          const selected = h.method === m.id;
          return (
            <OptionCard
              key={m.id}
              selected={selected}
              label={`${m.t}. ${m.d}`}
              onSelect={() => setState((s) => ({ ...s, health: { ...s.health, method: m.id, methodProvenance: "configured" } }))}
            >
              <OptionCardText title={m.t} description={m.d} />
            </OptionCard>
          );
        })}
      </div>

      {h.method === "http" ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Monitoring target type" htmlFor="ob-htt">
              <select
                id="ob-htt"
                value={h.targetType}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    health: { ...s.health, targetType: e.target.value as HealthTargetType, targetProvenance: "configured" },
                  }))
                }
                className={inputClass(false)}
              >
                {(Object.keys(HEALTH_TARGET_TYPE_LABEL) as HealthTargetType[]).map((type) => (
                  <option key={type} value={type}>
                    {HEALTH_TARGET_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
              <Hint>What the target URL represents: an external address is not cluster identity.</Hint>
            </Field>
            <Field label="Target URL" htmlFor="ob-htu" error={errors.targetUrl} required>
              <input
                id="ob-htu"
                value={h.targetUrl}
                placeholder="https://app.example.com"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    health: {
                      ...s.health,
                      targetUrl: e.target.value,
                      targetType: s.health.targetType === "unknown" && e.target.value.trim() ? "external_url" : s.health.targetType,
                      targetProvenance: "configured",
                    },
                  }))
                }
                className={inputClass(!!errors.targetUrl)}
              />
              <ProvenanceBadge provenance={h.targetProvenance} />
              <Hint>Where Safeguard connects. A temporary tunnel is an external target, not permanent infrastructure identity.</Hint>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Endpoint path" htmlFor="ob-hep" error={errors.endpoint} required>
              <input
                id="ob-hep"
                value={h.endpoint}
                placeholder="/"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setState((s) => ({ ...s, health: { ...s.health, endpoint: e.target.value, endpointProvenance: "configured" } }))}
                className={inputClass(!!errors.endpoint)}
              />
              <ProvenanceBadge provenance={h.endpointProvenance} />
              <Hint>Which route is checked on that target. Probe paths stay separate from this functional check.</Hint>
            </Field>
            <Field label="Expected status" htmlFor="ob-hexp" error={errors.expectedStatus}>
              <select
                id="ob-hexp"
                value={h.expectedStatus}
                onChange={(e) => setState((s) => ({ ...s, health: { ...s.health, expectedStatus: e.target.value } }))}
                className={inputClass(!!errors.expectedStatus)}
              >
                {["200", "201", "202", "204", "301", "302"].map((c) => (
                  <option key={c} value={c}>
                    HTTP {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Hint>
            {check.url ? `Resulting check URL: ${check.url}` : "Enter a target URL and endpoint path to preview the exact checked URL."}
          </Hint>
        </>
      ) : (
        <div className="rounded-md border border-border-hairline bg-canvas p-3">
          <Hint>
            {h.method === "port"
              ? "Port checks confirm reachability only — they say nothing about correct responses. Add an HTTP endpoint later for deeper checks."
              : "Container checks confirm the process stays up — they say nothing about serving traffic. Add an HTTP endpoint later for deeper checks."}
          </Hint>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="Interval (s)" htmlFor="ob-hint" error={errors.intervalSec}>
          <input
            id="ob-hint"
            value={h.intervalSec}
            inputMode="numeric"
            onChange={(e) => setState((s) => ({ ...s, health: { ...s.health, intervalSec: e.target.value.replace(/[^0-9]/g, "") } }))}
            className={inputClass(!!errors.intervalSec)}
          />
        </Field>
        <Field label="Timeout (s)" htmlFor="ob-hto" error={errors.timeoutSec}>
          <input
            id="ob-hto"
            value={h.timeoutSec}
            inputMode="numeric"
            onChange={(e) => setState((s) => ({ ...s, health: { ...s.health, timeoutSec: e.target.value.replace(/[^0-9]/g, "") } }))}
            className={inputClass(!!errors.timeoutSec)}
          />
        </Field>
        <Field label="Failures to alert" htmlFor="ob-hft" error={errors.failureThreshold}>
          <input
            id="ob-hft"
            value={h.failureThreshold}
            inputMode="numeric"
            onChange={(e) => setState((s) => ({ ...s, health: { ...s.health, failureThreshold: e.target.value.replace(/[^0-9]/g, "") } }))}
            className={inputClass(!!errors.failureThreshold)}
          />
        </Field>
      </div>
    </div>
  );
}
