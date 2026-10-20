import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  Activity,
  ArrowLeft,
  Clock,
  Download,
  FileText,
  FlaskConical,
  Gauge,
  Rocket,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { UserGreeting } from "@/components/auth/UserGreeting";
import { DatabaseSetupNotice } from "@/components/projects/DatabaseSetupNotice";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/IncidentBadges";
import { PrintButton } from "@/components/incidents/PrintButton";
import { PRODUCT_NAME } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { USER_ID_HEADER } from "@/lib/supabase/middleware";
import { loadIncidentBundle, type IncidentBundle } from "@/lib/incidents/load";
import { formatAbsoluteTime, formatRelativeTime, HEALTH_LABEL } from "@/lib/projects";
import {
  CONFIDENCE_LABEL,
  EVIDENCE_SOURCE_LABEL,
  INCIDENT_SEVERITY_LABEL,
  LIFECYCLE_PHASE_LABEL,
  REMEDIATION_STATUS_LABEL,
  RISK_LABEL,
  type IncidentEvidence,
} from "@/lib/incidents";

export const dynamic = "force-dynamic";

export default async function IncidentReportPage({
  params,
}: {
  params: Promise<{ id: string; incidentId: string }>;
}) {
  const { id, incidentId } = await params;
  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return (
      <ReportShell projectId={id}>
        <Card className="flex items-start gap-3 border-warning-border bg-warning-tint p-4">
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <p className="text-[14px] leading-6 text-warning">
            Authentication isn&apos;t configured yet. Add the Supabase keys to{" "}
            <code className="font-mono text-[13px]">.env.local</code>.
          </p>
        </Card>
      </ReportShell>
    );
  }

  const userId = (await headers()).get(USER_ID_HEADER);
  if (!userId) {
    redirect(
      `/login?next=/projects/${id}/incidents/${incidentId}/report`,
    );
  }

  const result = await loadIncidentBundle(supabase, id, incidentId);
  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return (
      <ReportShell projectId={id}>
        <div role="alert">
          <DatabaseSetupNotice message={result.message} />
        </div>
      </ReportShell>
    );
  }

  return (
    <ReportShell
      projectId={id}
      projectName={result.bundle.project?.name ?? "Project"}
    >
      <ReportView bundle={result.bundle} now={Date.now()} />
    </ReportShell>
  );
}

/** Chrome around the report. The nav/header is hidden when printing so the
 *  saved PDF is just the report body. */
function ReportShell({
  projectId,
  projectName,
  children,
}: {
  projectId: string;
  projectName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <header className="mx-auto flex h-16 max-w-app items-center justify-between gap-4 border-b border-border-hairline px-4 lg:px-8 print:hidden">
        <Link
          href="/projects"
          className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          aria-label={`${PRODUCT_NAME} — all projects`}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded bg-brand font-mono text-[14px] font-semibold text-white"
          >
            DS
          </span>
          <span className="text-[16px] font-semibold tracking-tight text-ink">
            {PRODUCT_NAME}
          </span>
        </Link>
        <span className="flex items-center gap-3">
          <UserGreeting />
          <SignOutButton />
        </span>
      </header>
      <main
        id="main-content"
        className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-16 pt-8 lg:px-8 print:max-w-none print:px-0 print:pt-0"
      >
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex w-fit items-center gap-1.5 rounded text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 print:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {projectName ? `Back to ${projectName}` : "Back to project"}
        </Link>
        {children}
      </main>
    </div>
  );
}

/** Human duration between two instants, e.g. "1h 12m"; honest about ongoing. */
function formatDuration(fromIso: string, toIso: string | null): string {
  const start = Date.parse(fromIso);
  const end = toIso ? Date.parse(toIso) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const mins = Math.floor((end - start) / 60000);
  if (mins < 1) return "under a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function ReportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd className="text-[14px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/** A print-first report block: heading + body, no card chrome when printing. */
function ReportSection({
  icon,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border-hairline bg-surface p-5 shadow-card print:border-0 print:p-0 print:shadow-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border-hairline pb-2">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-ink">
          <span className="text-ink-muted">{icon}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ReportView({ bundle, now }: { bundle: IncidentBundle; now: number }) {
  const { incident, project, service } = bundle;
  const exportHref = `/projects/${project?.id ?? incident.id}/incidents/${incident.id}/report/export`;
  return (
    <div className="flex flex-col gap-6">
      {/* Controls — never printed */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/projects/${project?.id ?? ""}/incidents/${incident.id}`}
          className="inline-flex w-fit items-center gap-1.5 rounded text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to incident
        </Link>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <PrintButton />
          <a
            href={exportHref}
            download
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:border-ink-muted hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export JSON
          </a>
        </span>
      </div>

      {/* Report header */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-brand">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Incident report
          </span>
          {incident.isDemo ? (
            <Badge
              tone="ai"
              icon={<FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            >
              Sample data
            </Badge>
          ) : null}
        </div>
        <h1 className="text-[26px] font-semibold leading-8 tracking-tight text-ink">
          {incident.title}
        </h1>
        <p className="text-[12px] text-ink-muted">
          {PRODUCT_NAME} · {project?.name ?? "Project"} · generated{" "}
          {formatAbsoluteTime(new Date(now).toISOString())}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <IncidentSeverityBadge severity={incident.severity} />
          <IncidentStatusBadge status={incident.status} />
        </div>
        {incident.summary ? (
          <p className="mt-1 max-w-2xl text-[14px] leading-6 text-ink-secondary">
            {incident.summary}
          </p>
        ) : null}
      </div>

      {/* Key facts */}
      <ReportSection
        icon={<Activity className="h-4 w-4" aria-hidden="true" />}
        title="Summary"
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <ReportFact label="Affected service" value={service?.name ?? "Not specified"} />
          <ReportFact label="Severity" value={INCIDENT_SEVERITY_LABEL[incident.severity]} />
          <ReportFact label="Lifecycle phase" value={LIFECYCLE_PHASE_LABEL[bundle.phase]} />
          <ReportFact
            label="Detected"
            value={`${formatAbsoluteTime(incident.detectedAt)} (${formatRelativeTime(incident.detectedAt, now)})`}
          />
          <ReportFact
            label={incident.resolvedAt ? "Resolved" : "Status"}
            value={
              incident.resolvedAt
                ? formatAbsoluteTime(incident.resolvedAt)
                : "Ongoing"
            }
          />
          <ReportFact
            label={incident.resolvedAt ? "Total duration" : "Open for"}
            value={formatDuration(incident.detectedAt, incident.resolvedAt)}
          />
        </dl>
      </ReportSection>

      <ObservedSection bundle={bundle} now={now} />
      <AiSection bundle={bundle} />
      <RemediationSummary bundle={bundle} now={now} />

      {incident.isDemo ? (
        <p className="text-[12px] leading-5 text-ink-muted">
          This report describes a controlled demonstration scenario. All services,
          signals, and remediations are clearly-labelled sample data.
        </p>
      ) : null}
    </div>
  );
}

const EVIDENCE_SOURCE_ORDER = [
  "metric",
  "log",
  "trace",
  "event",
  "config",
] as const;

function EvidenceLine({ item, now }: { item: IncidentEvidence; now: number }) {
  return (
    <li className="flex flex-col gap-0.5 border-l-2 border-border-hairline pl-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[13px] font-medium text-ink">{item.label}</span>
        {item.observedAt ? (
          <span className="font-mono text-[11px] text-ink-muted">
            {formatRelativeTime(item.observedAt, now)}
          </span>
        ) : null}
      </div>
      {item.detail ? (
        <p className="text-[13px] leading-5 text-ink-secondary">{item.detail}</p>
      ) : null}
    </li>
  );
}

/** Observed facts (§19): telemetry, logs, events — never AI-generated. */
function ObservedSection({
  bundle,
  now,
}: {
  bundle: IncidentBundle;
  now: number;
}) {
  const { evidence, relatedChanges, checks, events } = bundle;
  const sources = EVIDENCE_SOURCE_ORDER.filter((s) =>
    evidence.some((e) => e.source === s),
  );
  const latest = checks[0] ?? null;
  return (
    <ReportSection
      icon={<FileText className="h-4 w-4" aria-hidden="true" />}
      title="What was observed"
    >
      <p className="mb-3 text-[12px] leading-5 text-ink-muted">
        Recorded signals and events. These are facts captured by the system — not
        AI interpretation.
      </p>
      <div className="flex flex-col gap-4">
        {sources.length > 0 ? (
          sources.map((source) => (
            <div key={source} className="flex flex-col gap-1.5">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
                {EVIDENCE_SOURCE_LABEL[source]}
              </h3>
              <ul className="flex flex-col gap-2">
                {evidence
                  .filter((e) => e.source === source)
                  .map((item) => (
                    <EvidenceLine key={item.id} item={item} now={now} />
                  ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="text-[13px] leading-5 text-ink-muted">
            No evidence was attached to this incident.
          </p>
        )}

        {latest ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
              Latest health signal
            </h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <ReportFact label="Reported status" value={HEALTH_LABEL[latest.status]} />
              <ReportFact
                label="Error rate"
                value={
                  latest.errorRate != null
                    ? `${(latest.errorRate * 100).toFixed(1)}%`
                    : "Not reported"
                }
              />
              <ReportFact
                label="Latency"
                value={latest.latencyMs != null ? `${latest.latencyMs}ms` : "Not reported"}
              />
              <ReportFact label="Source" value={latest.source} />
            </dl>
          </div>
        ) : null}

        {relatedChanges.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
              <Rocket className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
              Related changes
            </h3>
            <p className="text-[12px] leading-5 text-ink-muted">
              Occurred near the incident — correlation in time, not a proven cause.
            </p>
            <ul className="flex flex-col gap-2">
              {relatedChanges.map((item) => (
                <EvidenceLine key={item.id} item={item} now={now} />
              ))}
            </ul>
          </div>
        ) : null}

        {events.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
              <Clock className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
              Timeline
            </h3>
            <ol className="flex flex-col gap-2">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-col gap-0.5 border-l-2 border-border-hairline pl-3"
                >
                  <p className="text-[13px] leading-5 text-ink">{event.message}</p>
                  <span className="font-mono text-[11px] text-ink-muted">
                    <span className={event.actor === "ai" ? "font-medium text-ai" : ""}>
                      {event.actor === "ai"
                        ? "AI"
                        : event.actor === "user"
                          ? "You"
                          : "System"}
                    </span>
                    {" · "}
                    {formatAbsoluteTime(event.at)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </ReportSection>
  );
}

function AiReportField({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ai">
        {title}
      </h3>
      <p className="text-[13px] leading-6 text-ink">{body}</p>
    </div>
  );
}

/** AI interpretation (§19) — clearly separated from observed facts, violet,
 *  and always shipped with its hedging disclaimer. */
function AiSection({ bundle }: { bundle: IncidentBundle }) {
  const { analysis } = bundle;
  if (!analysis) {
    return (
      <ReportSection
        icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
        title="AI interpretation"
      >
        <p className="text-[13px] leading-6 text-ink-muted">
          No AI analysis was generated for this incident.
        </p>
      </ReportSection>
    );
  }
  return (
    <section className="overflow-hidden rounded-md border border-ai-border bg-surface shadow-card print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ai-border bg-ai-tint px-5 py-3 print:bg-ai-tint">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold text-ai">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          AI interpretation
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ai">
          <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {CONFIDENCE_LABEL[analysis.confidence]}
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <AiReportField title="Observation" body={analysis.observation} />
        <AiReportField title="Interpretation" body={analysis.interpretation} />
        {analysis.confidenceRationale ? (
          <AiReportField title="Why this confidence" body={analysis.confidenceRationale} />
        ) : null}
        {analysis.suggestedAction ? (
          <AiReportField title="Suggested action" body={analysis.suggestedAction} />
        ) : null}
        <p className="flex items-start gap-1.5 rounded-md border border-ai-border bg-ai-tint px-3 py-2 text-[12px] leading-5 text-ai">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {analysis.disclaimer}
        </p>
      </div>
    </section>
  );
}

const VERIFICATION_REPORT_LABEL: Record<string, string> = {
  running: "In progress",
  passed: "Recovery confirmed",
  failed: "Not confirmed",
  cancelled: "Cancelled",
};

/** Read-only summary of what was proposed, approved, executed, and verified. */
function RemediationSummary({
  bundle,
  now,
}: {
  bundle: IncidentBundle;
  now: number;
}) {
  const { remediations, verifications } = bundle;
  return (
    <ReportSection
      icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
      title="Remediation & verification"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
            Remediations
          </h3>
          {remediations.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {remediations.map((action) => (
                <li
                  key={action.id}
                  className="flex flex-col gap-0.5 border-l-2 border-border-hairline pl-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[13px] font-medium text-ink">
                      {action.title}
                    </span>
                    <span className="font-mono text-[11px] text-ink-muted">
                      {RISK_LABEL[action.risk]} ·{" "}
                      {REMEDIATION_STATUS_LABEL[action.status]}
                    </span>
                  </div>
                  {action.result ? (
                    <p className="text-[13px] leading-5 text-ink-secondary">
                      {action.result}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] leading-5 text-ink-muted">
              No remediation was proposed for this incident.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
            Recovery verification
          </h3>
          {verifications.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {verifications.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 border-l-2 border-border-hairline pl-3"
                >
                  <span className="text-[13px] font-medium text-ink">
                    {VERIFICATION_REPORT_LABEL[run.status] ?? run.status}
                  </span>
                  <span className="font-mono text-[11px] text-ink-muted">
                    {run.checksPassed}/{run.checksRequired} checks ·{" "}
                    {formatRelativeTime(run.startedAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] leading-5 text-ink-muted">
              No verification has run yet.
            </p>
          )}
        </div>
      </div>
    </ReportSection>
  );
}
