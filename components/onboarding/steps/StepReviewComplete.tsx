import { Check, Loader, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { Provenance, WizardState, WizardStepId } from "@/lib/onboarding/types";
import { WIZARD_STEP_META } from "@/lib/onboarding/types";
import { buildCanonicalConfiguration } from "@/lib/onboarding/configuration";
import { HEALTH_TARGET_TYPE_LABEL } from "@/lib/onboarding/health";
import { ProvenanceBadge } from "../ProvenanceBadge";

/** Step 9 — Review & Connect: grouped summary, edit any section. */
export function StepReview({
  state,
  onEdit,
  submitError,
  isSubmitting,
  onSubmit,
}: {
  state: WizardState;
  onEdit: (step: WizardStepId) => void;
  submitError: string | null;
  isSubmitting: boolean;
  onSubmit: () => void;
}) {
  const a = state.analysis;
  const canonical = buildCanonicalConfiguration(state);
  const startValue =
    canonical.runtime.startState === "command"
      ? canonical.runtime.startCommand || "—"
      : canonical.runtime.startState === "deployment_managed"
        ? "Deployment-managed (not stored)"
        : "—";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-ink">
          Review &amp; connect
        </h2>
        <p className="mt-1 text-[14px] leading-6 text-ink-secondary">
          Check everything once. Nothing is created until you press{" "}
          <strong className="font-medium text-ink">Start Monitoring</strong>.
        </p>
      </div>

      {submitError ? (
        <p role="alert" className="rounded-md border border-critical-border bg-critical-tint px-3 py-2 text-[13px] text-critical">
          {submitError}
        </p>
      ) : null}

      <ReviewGroup title="Project" onEdit={() => onEdit("basics")}>
        <Row k="Name" v={state.basics.name || "—"} />
        <Row k="Description" v={state.basics.description || "—"} />
        <Row k="Tags" v={state.basics.tags.length > 0 ? state.basics.tags.join(", ") : "—"} />
        <Row k="Environment" v={state.basics.environment || "—"} />
      </ReviewGroup>

      <ReviewGroup title="Repository" onEdit={() => onEdit("repository")}>
        <Row k="URL" v={state.repository.url || "Not connected"} mono />
        <Row k="Branch" v={state.repository.branch || "main"} mono />
        <Row k="Provider" v={state.repository.provider === "github" ? "GitHub (public URL)" : state.repository.provider ? "Other host (manual)" : "—"} />
      </ReviewGroup>

      <ReviewGroup title="Detected technology" onEdit={() => onEdit("analysis")}>
        {a?.status === "ready" ? (
          <>
            <Row k="Framework" v={a.framework.value ?? "Not detected"} />
            <Row k="Language" v={a.language.value ?? "Not detected"} />
            <Row k="Package manager" v={a.packageManager.value ?? "Not detected"} />
            <Row k="Dockerfile" v={a.dockerfile.value ? "Detected" : "Not detected"} />
            <Row k="Compose" v={a.compose.value ? "Detected" : "Not detected"} />
            <Row k="Kubernetes" v={a.kubernetes.value ? "Detected" : "Not detected"} />
          </>
        ) : (
          <p className="text-[13px] text-ink-secondary">
            Analysis unavailable — manual configuration applies.{" "}
            <span className="font-mono text-[12px] text-ink-muted">
              {a?.reason ?? "No repository analysed."}
            </span>
          </p>
        )}
      </ReviewGroup>

      <ReviewGroup title="Deployment" onEdit={() => onEdit("deployment")}>
        <Row k="Strategy" v={canonical.deployment.label} />
        {state.deployment.notes ? <Row k="Notes" v={state.deployment.notes} /> : null}
      </ReviewGroup>

      <ReviewGroup title="Runtime" onEdit={() => onEdit("runtime")}>
        <Row k="Build" v={canonical.runtime.buildCommand || "—"} mono p={canonical.runtime.buildCommand ? state.runtime.buildProvenance : undefined} />
        <Row k="Production start" v={startValue} mono p={canonical.runtime.startCommand ? state.runtime.startProvenance : undefined} />
        {/* Dev is listed separately so it is obvious monitoring was pointed at
            the production command, not the dev server. */}
        <Row k="Development" v={canonical.runtime.devCommand || "Not set"} mono p={canonical.runtime.devCommand ? state.runtime.devCommandProvenance : undefined} />
        <Row k="Runtime" v={canonical.runtime.runtime || "—"} p={canonical.runtime.runtime ? state.runtime.runtimeProvenance : undefined} />
        <Row k="Port" v={`${canonical.runtime.port || "—"} / ${canonical.runtime.protocol}`} mono p={canonical.runtime.port ? state.runtime.portProvenance : undefined} />
        {state.runtime.rootDirectory ? <Row k="Root" v={state.runtime.rootDirectory} mono /> : null}
      </ReviewGroup>

      <ReviewGroup title="Environment" onEdit={() => onEdit("environment")}>
        <Row k="Variables" v={state.environment.vars.length > 0 ? `${state.environment.vars.length} defined` : "None"} />
        {state.environment.vars.slice(0, 5).map((v) => (
          <Row key={v.key} k={v.key} v={v.value || "(empty)"} mono />
        ))}
        <Row
          k="Secrets"
          v={
            state.environment.secrets.length > 0
              ? state.environment.secrets.map((s) => `${s.key}${s.hasValue ? " (value set)" : " (name only)"}`).join(", ")
              : "None"
          }
          mono
        />
        <p className="text-[12px] text-ink-muted">Secret values are never stored — only names travel to the server.</p>
      </ReviewGroup>

      <ReviewGroup title="Dependencies" onEdit={() => onEdit("dependencies")}>
        <Row k="PostgreSQL" v={state.dependencies.postgres} />
        <Row k="MySQL" v={state.dependencies.mysql} />
        <Row k="MongoDB" v={state.dependencies.mongodb} />
        <Row k="Redis" v={state.dependencies.redis} />
        {state.dependencies.externalApis.filter(Boolean).length > 0 ? (
          <Row k="External APIs" v={state.dependencies.externalApis.filter(Boolean).join(", ")} mono />
        ) : null}
      </ReviewGroup>

      <ReviewGroup title="Health monitoring" onEdit={() => onEdit("health")}>
        <Row
          k="Method"
          v={
            canonical.health.method === "http"
              ? `HTTP ${canonical.health.endpointPath ?? "—"} → ${canonical.health.expectedStatus}`
              : canonical.health.method === "port"
                ? "Port availability"
                : "Container availability"
          }
          mono
          p={canonical.health.methodProvenance === "not_detected" ? undefined : canonical.health.methodProvenance}
        />
        {canonical.health.method === "http" ? (
          <>
            <Row k="Target type" v={HEALTH_TARGET_TYPE_LABEL[canonical.health.targetType]} />
            <Row k="Target URL" v={canonical.health.targetUrl ?? "—"} mono p={canonical.health.targetProvenance === "not_detected" ? undefined : canonical.health.targetProvenance} />
            <Row k="Endpoint path" v={canonical.health.endpointPath ?? "—"} mono p={canonical.health.endpointProvenance === "not_detected" ? undefined : canonical.health.endpointProvenance} />
            <Row k="Checked URL" v={canonical.health.checkUrl ?? "—"} mono />
          </>
        ) : null}
        <Row
          k="Schedule"
          v={`every ${canonical.health.intervalSec}s · timeout ${canonical.health.timeoutSec}s · alert after ${canonical.health.failureThreshold} failures`}
          mono
        />
      </ReviewGroup>

      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting}
        className="inline-flex h-11 items-center justify-center gap-2 rounded bg-brand px-5 text-[15px] font-semibold text-white shadow-md transition-all hover:bg-brand-hover disabled:cursor-wait disabled:opacity-70"
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
      <p className="text-[12px] text-ink-muted">
        Creates one project and saves this configuration. You can edit everything later in Settings.
      </p>
    </div>
  );
}

function ReviewGroup({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border-hairline bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium text-ink-secondary hover:bg-canvas hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          Edit
        </button>
      </div>
      <dl className="flex flex-col gap-1.5">{children}</dl>
    </section>
  );
}

function Row({ k, v, mono, p }: { k: string; v: string; mono?: boolean; p?: Provenance }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ink-muted">{k}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-2">
        <span className={mono ? "truncate font-mono text-[13px] text-ink" : "text-right text-[13px] text-ink"}>
          {v}
        </span>
        {p ? <ProvenanceBadge provenance={p} /> : null}
      </dd>
    </div>
  );
}

/** Step 10 — Setup Complete. Honest: config saved, first check pending. */
export function StepComplete({
  state,
  projectId,
}: {
  state: WizardState;
  projectId: string;
}) {
  const a = state.analysis;
  const canonical = buildCanonicalConfiguration(state);
  const healthTarget =
    canonical.health.method === "http"
      ? canonical.health.checkUrl ?? "incomplete HTTP target"
      : canonical.health.method === "port"
        ? `port ${canonical.runtime.port || "not set"}`
        : `container ${canonical.health.endpointPath || "not set"}`;

  // Three separate facts. "Configuration saved" must never be read as
  // "the application is healthy" — nothing has been checked yet.
  const outcome: { label: string; detail: string; tone: "healthy" | "unknown" }[] = [
    {
      label: "Configuration saved",
      detail: "Your answers are stored and the project exists.",
      tone: "healthy",
    },
    {
      label: "Monitoring configured",
      detail: `DevOps Safeguard knows how to check ${healthTarget || "this project"}.`,
      tone: "healthy",
    },
    {
      label: "First check pending",
      detail:
        "No check has run yet, so health is Unknown — not Healthy and not failing.",
      tone: "unknown",
    },
  ];

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-brand">
        <Check className="h-6 w-6" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-[22px] font-semibold tracking-tight text-ink">
          {state.basics.name || "Project"} is configured
        </h2>
        <p className="mx-auto mt-1 max-w-md text-[14px] leading-6 text-ink-secondary">
          The setup is saved. Health stays{" "}
          <strong className="font-medium text-ink">Unknown</strong> until the
          first check reports — that honesty is by design.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-2 text-left">
        {outcome.map((o) => (
          <li
            key={o.label}
            className="flex items-start gap-2.5 rounded-md border border-border-hairline bg-surface px-3 py-2.5"
          >
            <Badge tone={o.tone} className="mt-0.5 shrink-0">
              {o.label}
            </Badge>
            <p className="text-[13px] leading-5 text-ink-secondary">{o.detail}</p>
          </li>
        ))}
      </ul>

      <dl className="grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2">
        <FactBox label="Repository" value={state.repository.url || "Not connected"} />
        <FactBox label="Environment" value={state.basics.environment || "—"} />
        <FactBox
          label="Detected"
          value={
            a?.status === "ready"
              ? [a.framework.value, a.language.value, a.dockerfile.value ? "Docker" : null]
                  .filter(Boolean)
                  .join(" · ") || "Nothing detected"
              : "Analysis unavailable"
          }
        />
        <FactBox label="Monitoring" value={`Configured — ${healthTarget || "not set"}`} />
      </dl>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge tone="healthy" icon={<Check className="h-3 w-3" aria-hidden="true" />}>
          ✓ Configuration saved
        </Badge>
        <ProvenanceBadge provenance={a?.status === "ready" ? "detected" : "unavailable"} />
      </div>

      <div className="w-full rounded-md border border-info-border bg-info-tint p-3 text-left">
        <p className="text-[13px] font-semibold text-info">Recommended next step</p>
        <p className="mt-0.5 text-[13px] leading-5 text-ink-secondary">
          Open the dashboard, verify the runtime and health settings, then
          connect your first monitoring source. Active incidents will appear
          there with evidence — nothing is fabricated before then.
        </p>
      </div>

      <a
        href={`/projects/${projectId}`}
        className="inline-flex h-11 items-center justify-center rounded bg-brand px-6 text-[15px] font-semibold text-white shadow-md transition-all hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        Open Dashboard
      </a>
      <p className="font-mono text-[12px] text-ink-muted">
        Step {WIZARD_STEP_META.complete.index + 1} of 10 · {projectId.slice(0, 8)}
      </p>
    </div>
  );
}

function FactBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-hairline bg-canvas px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[13px] text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}
