import { Loader, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { DeploymentStrategy, Evidence, HealthEndpointRole, PortFinding, PortRole, RepoAnalysis, SupportedDependencyService } from "@/lib/onboarding/types";
import { applyDeploymentStrategy } from "@/lib/onboarding/configuration";
import { deploymentOptionsFromAnalysis, deploymentStrategyLabel } from "@/lib/onboarding/deployment";
import { evidencePaths } from "@/lib/onboarding/evidence";
import { groupPortFindings } from "@/lib/onboarding/ports";
import { Field, Hint, SectionCard } from "../StepFields";
import { DependencyBadge, ProvenanceBadge } from "../ProvenanceBadge";
import type { StepProps } from "./StepBasicsRepo";

const PORT_ROLE_LABEL: Record<PortRole, string> = {
  application_http: "Application HTTP",
  application_https: "Application HTTPS",
  metrics: "Metrics",
  grpc: "gRPC",
  database: "Database",
  cache: "Cache",
  message_queue: "Message queue",
  telemetry: "Telemetry",
  service: "Service",
  ingress: "Ingress",
  node_port: "NodePort",
  unknown: "Unknown",
};

const HEALTH_ROLE_LABEL: Record<HealthEndpointRole, string> = {
  application: "Application",
  liveness: "Kubernetes liveness",
  readiness: "Kubernetes readiness",
  startup: "Kubernetes startup",
  metrics: "Metrics",
};

function EvidenceLine({ evidence }: { evidence: Evidence }) {
  return (
    <span
      className="block truncate font-mono text-[11px] text-ink-muted"
      title={`${evidence.sourcePath}${evidence.line ? `:${evidence.line}` : ""} — ${evidence.explanation}`}
    >
      {evidence.sourcePath}
      {evidence.line ? `:${evidence.line}` : ""} · {evidence.confidence} confidence
    </span>
  );
}

function groupedPortRows(findings: PortFinding[]): { finding: PortFinding; evidence: Evidence[] }[] {
  const rows: Record<string, { finding: PortFinding; evidence: Evidence[] }> = {};
  for (const finding of findings) {
    const key = `${finding.port}\0${finding.protocol}\0${finding.role}`;
    if (!rows[key]) rows[key] = { finding, evidence: [] };
    if (!rows[key].evidence.some((item) => item.sourcePath === finding.evidence.sourcePath && item.line === finding.evidence.line)) {
      rows[key].evidence.push(finding.evidence);
    }
  }
  return Object.values(rows).sort((a, b) => a.finding.port - b.finding.port || a.finding.role.localeCompare(b.finding.role));
}

function PortFindings({ analysis }: { analysis: RepoAnalysis }) {
  const groups = groupPortFindings(analysis.portFindings);
  const selection = analysis.applicationPort.selected;
  const applicationRows = groupedPortRows(groups.application);
  const selectedRow = selection.value !== null
    ? applicationRows.find((row) => row.finding.port === selection.value) ?? null
    : null;
  const otherCount = groups.infrastructure.length + groups.network.length + groups.other.length;
  return (
    <div className="rounded border border-border-hairline bg-canvas px-2.5 py-2 sm:col-span-2">
      <div className="flex items-start justify-between gap-2">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Ports</dt>
        <ProvenanceBadge provenance={selection.value !== null ? "detected" : analysis.applicationPort.ambiguous ? "unknown" : "not_detected"} />
      </div>
      {selection.value !== null && selectedRow ? (
        <dd className="mt-1 font-mono text-[13px] text-ink" title={selectedRow.evidence.map((item) => item.explanation).join(" ")}>
          Application {selectedRow.finding.port} · {PORT_ROLE_LABEL[selectedRow.finding.role]}
        </dd>
      ) : analysis.applicationPort.ambiguous ? (
        <dd className="mt-1 text-[13px] text-ink">Multiple application ports detected — choose the actual one in Runtime.</dd>
      ) : (
        <dd className="mt-1 text-[13px] text-ink">No application port detected.</dd>
      )}
      {selectedRow ? selectedRow.evidence.map((item) => <EvidenceLine key={`${item.sourcePath}-${item.line ?? ""}`} evidence={item} />) : null}
      {analysis.applicationPort.ambiguous
        ? analysis.applicationPort.alternatives.map((finding) => (
            <p key={`${finding.port}-${finding.role}`} className="mt-1 font-mono text-[12px] text-ink" title={finding.evidence.explanation}>
              {finding.port} · {PORT_ROLE_LABEL[finding.role]} · {finding.evidence.sourcePath}
            </p>
          ))
        : null}
      {applicationRows.filter((row) => row.finding.port !== selection.value).slice(0, 2).map((row) => (
        <p key={`${row.finding.port}-${row.finding.role}`} className="mt-1 font-mono text-[12px] text-ink-secondary" title={row.evidence.map((item) => item.explanation).join(" ")}>
          Also observed: {row.finding.port} · {PORT_ROLE_LABEL[row.finding.role]}
        </p>
      ))}
      {groupedPortRows(groups.metrics).slice(0, 2).map((row) => (
        <p key={`${row.finding.port}-${row.finding.role}`} className="mt-1 font-mono text-[12px] text-ink-secondary" title={row.evidence.map((item) => item.explanation).join(" ")}>
          {PORT_ROLE_LABEL[row.finding.role]} {row.finding.port} · {row.evidence[0]?.sourcePath}
        </p>
      ))}
      {groupedPortRows(groups.grpc).slice(0, 2).map((row) => (
        <p key={`${row.finding.port}-${row.finding.role}`} className="mt-1 font-mono text-[12px] text-ink-secondary" title={row.evidence.map((item) => item.explanation).join(" ")}>
          gRPC {row.finding.port} · {row.evidence[0]?.sourcePath}
        </p>
      ))}
      {otherCount > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[12px] font-medium text-ink-secondary">Other discovered ports ({otherCount})</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {groupedPortRows([...groups.infrastructure, ...groups.network, ...groups.other]).slice(0, 8).map((row) => (
              <li key={`${row.finding.port}-${row.finding.role}-${row.evidence[0]?.sourcePath}`} title={row.evidence.map((item) => item.explanation).join(" ")}>
                <span className="font-mono text-[12px] text-ink-secondary">
                  {row.finding.port} · {PORT_ROLE_LABEL[row.finding.role]}
                </span>
                {row.evidence.map((item) => (
                  <EvidenceLine key={`${item.sourcePath}-${item.line ?? ""}`} evidence={item} />
                ))}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function HealthFindings({ analysis }: { analysis: RepoAnalysis }) {
  const endpoints = analysis.healthEndpoints.value ?? [];
  return (
    <div className="rounded border border-border-hairline bg-canvas px-2.5 py-2 sm:col-span-2">
      <div className="flex items-start justify-between gap-2">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Health endpoints by role</dt>
        <ProvenanceBadge provenance={endpoints.length > 0 ? "detected" : "not_detected"} />
      </div>
      {endpoints.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1">
          {endpoints.map((finding) => (
            <li key={`${finding.role}-${finding.path}`} title={finding.evidence.explanation}>
              <span className="font-mono text-[12px] text-ink">
                {HEALTH_ROLE_LABEL[finding.role]} {finding.path}
              </span>
              <EvidenceLine evidence={finding.evidence} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-ink">No health endpoint detected.</p>
      )}
    </div>
  );
}

function DependencyFindings({ analysis }: { analysis: RepoAnalysis }) {
  const services: SupportedDependencyService[] = ["postgres", "mysql", "mongodb", "redis"];
  return (
    <div className="rounded border border-border-hairline bg-canvas px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Dependency assessment</p>
      <ul className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {services.map((service) => {
          const finding = analysis.dependencyFindings[service];
          const paths = evidencePaths(finding.evidence);
          return (
            <li key={service} className="flex flex-col gap-1 rounded border border-border-hairline bg-surface px-2.5 py-2">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold capitalize text-ink">{service === "postgres" ? "PostgreSQL" : service}</span>
                <DependencyBadge status={finding.status} />
              </span>
              <span className="text-[12px] leading-5 text-ink-secondary">{finding.summary}</span>
              {paths.length > 0 ? (
                <span className="truncate font-mono text-[11px] text-ink-muted" title={`${finding.summary} — ${paths.join(", ")}`}>
                  {paths.slice(0, 2).join(" · ")}
                  {paths.length > 2 ? ` · +${paths.length - 2} more` : ""}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {analysis.dependencies.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] font-medium text-ink-secondary">
            Package names observed ({analysis.dependencies.length}) — capability only
          </summary>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {analysis.dependencies.slice(0, 12).map((dependency) => (
              <Badge key={dependency} tone="neutral">
                {dependency}
              </Badge>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** Step 3 — Repository Analysis: real findings only, honest fallback. */
export function StepAnalysis({
  state,
  setState,
  onAnalyze,
}: StepProps & { onAnalyze: () => void }) {
  const a = state.analysis;
  const status = state.analysisStatus;
  const hasUrl = state.repository.url.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-ink">
          Repository analysis
        </h2>
        <p className="mt-1 text-[14px] leading-6 text-ink-secondary">
          The wizard inspects the repository and later steps adapt to what it
          finds. Findings are labelled — nothing is invented.
        </p>
      </div>

      {status === "analyzing" ? (
        <div
          className="flex items-start gap-3 rounded-md border border-info-border bg-info-tint p-4"
          role="status"
          aria-live="polite"
        >
          <Loader className="mt-0.5 h-4 w-4 animate-spin text-info" aria-hidden="true" />
          <div>
            <p className="text-[14px] font-semibold text-info">Analysing repository…</p>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-secondary">
              Reading familiar configuration files over the public API. This
              usually takes a few seconds.
            </p>
          </div>
        </div>
      ) : null}

      {state.analysisError ? (
        <p role="alert" className="rounded-md border border-critical-border bg-critical-tint px-3 py-2 text-[13px] text-critical">
          {state.analysisError}
        </p>
      ) : null}

      {!hasUrl ? (
        <div className="rounded-md border border-dashed border-border bg-canvas p-4">
          <p className="text-[14px] font-medium text-ink">No repository to analyse</p>
          <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
            You continued without a URL. Detection is{" "}
            <strong className="font-medium text-ink">Unavailable</strong> — every
            later step offers manual configuration and the project still
            completes.
          </p>
        </div>
      ) : null}

      {status === "ready" && a?.status === "ready" ? (
        <SectionCard
          title="Detected configuration"
          description={`Analysed ${a.owner}/${a.repo} @ ${a.branch} — ${new Date(a.analyzedAt).toLocaleString()}`}
        >
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Fact label="Framework" value={a.framework.value ?? "—"} p={a.framework.provenance} evidence={a.evidence.framework} />
            <Fact label="Language / runtime" value={a.language.value ?? "—"} p={a.language.provenance} evidence={a.evidence.language} />
            <Fact label="Package manager" value={a.packageManager.value ?? "—"} p={a.packageManager.provenance} evidence={a.evidence.packageManager} />
            <Fact
              label="Production command"
              value={a.runtimeCommands.production.command ?? "—"}
              p={a.runtimeCommands.production.provenance}
              evidence={a.evidence.runtimeCommandProduction}
            />
            <Fact
              label="Build command"
              value={a.runtimeCommands.build.command ?? "—"}
              p={a.runtimeCommands.build.provenance}
              evidence={a.evidence.runtimeCommandBuild}
            />
            <Fact
              label="Development command"
              value={a.runtimeCommands.development.command ?? "—"}
              p={a.runtimeCommands.development.provenance}
              evidence={a.evidence.runtimeCommandDevelopment}
            />
            <PortFindings analysis={a} />
            <HealthFindings analysis={a} />
            <Fact label="Dockerfile" value={a.dockerfile.value ? "Found" : "—"} p={a.dockerfile.provenance} evidence={a.evidence.dockerfile} />
            <Fact label="Compose" value={a.compose.value ? "Found" : "—"} p={a.compose.provenance} evidence={a.evidence.compose} />
            <Fact label="Kubernetes" value={a.kubernetes.value ? "Found" : "—"} p={a.kubernetes.provenance} evidence={a.evidence.kubernetes} />
            <Fact label="Kustomize" value={a.kustomize.value ? "Found" : "—"} p={a.kustomize.provenance} evidence={a.evidence.kustomize} />
            <Fact label="Helm" value={a.helm.value ? "Found" : "—"} p={a.helm.provenance} evidence={a.evidence.helm} />
            <Fact
              label="CI"
              value={a.ci.length > 0 ? a.ci.join(", ") : "—"}
              p={a.ci.length > 0 ? "detected" : "not_detected"}
              evidence={a.evidence.ci}
            />
            <Fact
              label="Env files"
              value={a.envFiles.length > 0 ? a.envFiles.join(", ") : "—"}
              p={a.envFiles.length > 0 ? "detected" : "not_detected"}
            />
            <Fact
              label="Entry points"
              value={a.entryPoints.length > 0 ? a.entryPoints.slice(0, 3).join(", ") : "—"}
              p={a.entryPoints.length > 0 ? "detected" : "not_detected"}
              evidence={a.evidence.entryPoints}
            />
          </dl>
          <DependencyFindings analysis={a} />
          {a.envVarNames.length > 0 ? (
            <Hint>
              Variable NAMES seen in {a.envFiles[0]}: {a.envVarNames.slice(0, 10).join(", ")}
              {a.envVarNames.length > 10 ? ` (+${a.envVarNames.length - 10} more)` : ""} — values are
              never read. You can import the names on the next steps.
            </Hint>
          ) : null}
          {a.truncated ? (
            <Hint>
              This repository is too large for GitHub to list in one response, so
              detection covers only part of it. A finding marked “Not detected”
              here may exist further into the tree.
            </Hint>
          ) : null}
          <button
            type="button"
            onClick={onAnalyze}
            className="inline-flex w-fit items-center gap-1.5 rounded text-[13px] font-medium text-ink-secondary hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Re-run analysis
          </button>
        </SectionCard>
      ) : null}

      {status === "unavailable" || (status === "ready" && a?.status === "unavailable") ? (
        <div className="rounded-md border border-warning-border bg-warning-tint p-4">
          <p className="text-[14px] font-semibold text-warning">Analysis unavailable</p>
          <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
            {a?.reason ??
              "The repository couldn't be inspected. Continue with manual configuration — nothing is blocked."}
          </p>
          {hasUrl ? (
            <button
              type="button"
              onClick={onAnalyze}
              className="mt-2 inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-ink hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {status === "idle" && hasUrl ? (
        <button
          type="button"
          onClick={onAnalyze}
          className="inline-flex h-10 w-fit items-center gap-2 rounded bg-brand px-4 text-[14px] font-semibold text-white shadow-md hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          Analyse repository
        </button>
      ) : null}

      {status === "idle" && hasUrl ? (
        <Hint>
          Analysis reads public files only (manifests, Dockerfile, workflow
          names, <code className="font-mono">.env.example</code> variable names).
          It never reads secret values.
        </Hint>
      ) : null}
    </div>
  );
}

function Fact({
  label,
  value,
  p,
  evidence,
}: {
  label: string;
  value: string;
  p: import("@/lib/onboarding/types").Provenance;
  /** Repository observations that prove this finding. */
  evidence?: Evidence[];
}) {
  const paths = evidencePaths(evidence);
  return (
    <div className="flex items-start justify-between gap-2 rounded border border-border-hairline bg-canvas px-2.5 py-2">
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
        <dd className="truncate font-mono text-[13px] text-ink">{value}</dd>
        {/* Provenance: show which file proved it, so "Auto-detected" is
            verifiable rather than a claim the user has to trust. */}
        {paths.length > 0 ? (
          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-muted" title={paths.join(", ")}>
            {paths.slice(0, 2).join(" · ")}
            {paths.length > 2 ? ` · +${paths.length - 2} more` : ""}
          </p>
        ) : null}
      </div>
      <ProvenanceBadge provenance={p} />
    </div>
  );
}

/** Step 4 — Deployment: accept detected, pick another detected, or manual. */
export function StepDeployment({ state, setState, errors }: StepProps) {
  const options = deploymentOptionsFromAnalysis(state.analysis);
  const detected = options.filter((option) => option.detected).map((option) => option.strategy);
  const strategies = options.map((option) => ({
    id: option.strategy,
    title: deploymentStrategyLabel(option.strategy),
    desc: option.note,
    detected: option.detected,
    evidence: option.evidence,
  }));
  const d = state.deployment;
  // Name the evidence rather than saying "options are marked" — the user
  // should see WHAT was found, not a generic hint that something was.
  const foundTitles = detected.map((id) => deploymentStrategyLabel(id));
  const headline =
    detected.length === 1
      ? `We found ${foundTitles[0]} in your repository.`
      : detected.length > 1
        ? `We found ${foundTitles.join(", ")} in your repository — pick the one you actually deploy with.`
        : state.analysis?.status === "unavailable" || !state.analysis
          ? "We couldn't inspect a repository, so there's nothing to suggest. How is this deployed?"
          : "We couldn't identify how this application is deployed. How is it deployed?";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-ink">
          Deployment configuration
        </h2>
        <p className="mt-1 text-[14px] leading-6 text-ink-secondary">
          {headline}
          {detected.length > 0
            ? " Change it if the detected configuration is wrong."
            : " You can also skip this and set it up later in Settings."}
        </p>
      </div>
      {errors.strategy ? (
        <p role="alert" className="rounded-md border border-critical-border bg-critical-tint px-3 py-2 text-[13px] text-critical">
          {errors.strategy}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Deployment strategy">
        {strategies.map((s) => {
          const isDetected = s.detected;
          const selected = d.strategy === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setState((prev) => applyDeploymentStrategy(prev, s.id, prev.analysis))}
              className={
                selected
                  ? "flex items-start justify-between gap-3 rounded-md border border-brand bg-brand-light/50 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  : "flex items-start justify-between gap-3 rounded-md border border-border-hairline bg-surface p-3 text-left hover:border-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              }
            >
              <span className="flex items-start gap-3">
                {/* Visible radio indicator so the group reads as a radio set
                    at a glance, matching the pattern in Step 1. */}
                <span
                  aria-hidden="true"
                  className={
                    selected
                      ? "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-brand"
                      : "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border"
                  }
                >
                  {selected ? (
                    <span className="h-2 w-2 rounded-full bg-brand" />
                  ) : null}
                </span>
                <span>
                  <span className="text-[14px] font-semibold text-ink">{s.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-ink-secondary">{s.desc}</span>
                  {isDetected && s.evidence.length > 0 ? (
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-muted" title={s.evidence.join(", ")}>
                      {s.evidence.slice(0, 2).join(" · ")}
                    </span>
                  ) : null}
                </span>
              </span>
              {isDetected ? <ProvenanceBadge provenance="detected" /> : null}
            </button>
          );
        })}
      </div>
      {d.strategy === "manual" || d.strategy === "none" || d.strategy === "framework" ? (
        <Field label="Notes" htmlFor="ob-depnotes" hint="Optional">
          <input
            id="ob-depnotes"
            type="text"
            value={d.notes}
            maxLength={200}
            placeholder={d.strategy === "manual" ? "e.g. Deploy via Render blueprint" : "Anything the team should know"}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                deployment: { ...s.deployment, notes: e.target.value },
              }))
            }
            className="h-10 w-full rounded border border-border-hairline bg-surface px-3 text-[14px] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </Field>
      ) : null}
    </div>
  );
}
