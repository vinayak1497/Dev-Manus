import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  Activity,
  ArrowLeft,
  CircleCheck,
  CircleDot,
  Clock,
  FileText,
  FlaskConical,
  Gauge,
  Lightbulb,
  MessageSquare,
  Play,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { UserGreeting } from "@/components/auth/UserGreeting";
import { DatabaseSetupNotice } from "@/components/projects/DatabaseSetupNotice";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/IncidentBadges";
import { IncidentActions } from "@/components/incidents/IncidentActions";
import { IncidentPoller } from "@/components/incidents/IncidentPoller";
import { RemediationControls } from "@/components/incidents/RemediationControls";
import { PRODUCT_NAME } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { USER_ID_HEADER } from "@/lib/supabase/middleware";
import { formatAbsoluteTime, formatRelativeTime, HEALTH_LABEL } from "@/lib/projects";
import {
  CONFIDENCE_LABEL,
  EVIDENCE_SOURCE_LABEL,
  INCIDENT_SEVERITY_LABEL,
  LIFECYCLE_PHASE_LABEL,
  LIFECYCLE_PHASE_ORDER,
  isActiveIncident,
  type AiAnalysisRecord,
  type AiConfidence,
  type EventActor,
  type EventKind,
  type EvidenceSource,
  type Incident,
  type IncidentEvent,
  type IncidentEvidence,
  type IncidentLifecyclePhase,
  type RemediationAction,
  type ServiceHealthCheck,
  type VerificationRun,
  type VerificationStatus,
} from "@/lib/incidents";
import { loadIncidentBundle } from "@/lib/incidents/load";

export const dynamic = "force-dynamic";

type Tone = Parameters<typeof Badge>[0]["tone"];

const CONFIDENCE_TONE: Record<AiConfidence, Tone> = {
  low: "neutral",
  medium: "warning",
  high: "healthy",
};

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

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string; incidentId: string }>;
}) {
  const { id, incidentId } = await params;
  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return (
      <Shell projectId={id}>
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
      </Shell>
    );
  }

  const userId = (await headers()).get(USER_ID_HEADER);
  if (!userId) {
    redirect(`/login?next=/projects/${id}/incidents/${incidentId}`);
  }

  const result = await loadIncidentBundle(
    supabase,
    id,
    incidentId,
  );

  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return (
      <Shell projectId={id}>
        <div role="alert">
          <DatabaseSetupNotice message={result.message} />
        </div>
      </Shell>
    );
  }

  const { bundle } = result;


  return (
    <Shell projectId={id} projectName={bundle.project?.name ?? "Project"}>
      <IncidentDetailView
        projectId={id}
        incident={bundle.incident}
        serviceName={bundle.service?.name ?? null}
        phase={bundle.phase}
        events={bundle.events}
        evidence={bundle.evidence}
        relatedChanges={bundle.relatedChanges}
        analysis={bundle.analysis}
        remediations={bundle.remediations}
        verifications={bundle.verifications}
        checks={bundle.checks}
        now={Date.now()}
      />
    </Shell>
  );
}

/** Product chrome for the incident detail — header + back-to-project link. */
function Shell({
  projectId,
  projectName,
  children,
}: {
  projectId: string;
  projectName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex h-16 max-w-app items-center justify-between gap-4 border-b border-border-hairline px-4 lg:px-8">
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
        className="mx-auto flex max-w-app flex-col gap-6 px-4 pb-16 pt-8 lg:px-8"
      >
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex w-fit items-center gap-1.5 rounded text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {projectName ? `Back to ${projectName}` : "Back to project"}
        </Link>
        {children}
      </main>
    </div>
  );
}

/** A titled card section: icon + title, with an optional right-aligned aside. */
function Section({
  icon,
  title,
  aside,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-[16px] font-semibold text-ink">
          <span className="text-ink-muted">{icon}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function IncidentDetailView({
  projectId,
  incident,
  serviceName,
  phase,
  events,
  evidence,
  relatedChanges,
  analysis,
  remediations,
  verifications,
  checks,
  now,
}: {
  projectId: string;
  incident: Incident;
  serviceName: string | null;
  phase: IncidentLifecyclePhase;
  events: IncidentEvent[];
  evidence: IncidentEvidence[];
  relatedChanges: IncidentEvidence[];
  analysis: AiAnalysisRecord | null;
  remediations: RemediationAction[];
  verifications: VerificationRun[];
  checks: ServiceHealthCheck[];
  now: number;
}) {
  const active = isActiveIncident(incident.status);
  const latestCheck = checks[0] ?? null;
  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <IncidentSeverityBadge severity={incident.severity} />
            <IncidentStatusBadge status={incident.status} />
            {incident.isDemo ? (
              <Badge
                tone="ai"
                icon={<FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              >
                Sample data
              </Badge>
            ) : null}
            {active ? <IncidentPoller projectId={projectId} active /> : null}
          </div>
          <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-ink">
            {incident.title}
          </h1>
          {incident.summary ? (
            <p className="max-w-3xl text-[14px] leading-6 text-ink-secondary">
              {incident.summary}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-secondary">
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-ink-muted" aria-hidden="true" />
              {serviceName ?? "No specific service"}
            </span>
            <span className="font-mono text-[12px] text-ink-muted">
              Detected {formatAbsoluteTime(incident.detectedAt)} ·{" "}
              {formatRelativeTime(incident.detectedAt, now)}
            </span>
            {incident.resolvedAt ? (
              <span className="font-mono text-[12px] text-ink-muted">
                Resolved {formatAbsoluteTime(incident.resolvedAt)}
              </span>
            ) : null}
          </div>
        </div>
        <IncidentActions
          projectId={projectId}
          incidentId={incident.id}
          hasAnalysis={analysis !== null}
        />
      </div>
      <LifecycleProgress phase={phase} />
      <ImpactGrid
        incident={incident}
        serviceName={serviceName}
        latestCheck={latestCheck}
        now={now}
      />
      <AiAnalysisPanel analysis={analysis} remediations={remediations} />
      <EvidenceSection evidence={evidence} now={now} />
      {relatedChanges.length > 0 ? (
        <RelatedChangesSection items={relatedChanges} now={now} />
      ) : null}
      {verifications.length > 0 ? (
        <VerificationSection runs={verifications} now={now} />
      ) : null}
      <Timeline events={events} now={now} />
      <ReportFooter projectId={projectId} incidentId={incident.id} />
    </>
  );
}

/** Horizontal lifecycle progress over the derived display phases (§6). */
function LifecycleProgress({ phase }: { phase: IncidentLifecyclePhase }) {
  const currentIndex = LIFECYCLE_PHASE_ORDER.indexOf(phase);
  return (
    <Card className="p-5">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {LIFECYCLE_PHASE_ORDER.map((p, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={p} className="flex items-center gap-2">
              <span
                aria-current={current ? "step" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[12px] font-medium leading-4 ${
                  current
                    ? "border-brand bg-brand/10 text-brand"
                    : done
                      ? "border-success-border bg-success-tint text-success"
                      : "border-border-hairline bg-subtle text-ink-muted"
                }`}
              >
                {done ? (
                  <CircleCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <CircleDot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                {LIFECYCLE_PHASE_LABEL[p]}
              </span>
              {i < LIFECYCLE_PHASE_ORDER.length - 1 ? (
                <span aria-hidden="true" className="text-ink-muted">
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** One labelled fact in an impact/observation grid. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd className="text-[14px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/** Impact summary: what is affected, since when, and the observed signal. */
function ImpactGrid({
  incident,
  serviceName,
  latestCheck,
  now,
}: {
  incident: Incident;
  serviceName: string | null;
  latestCheck: ServiceHealthCheck | null;
  now: number;
}) {
  const errorPct =
    latestCheck?.errorRate != null
      ? `${(latestCheck.errorRate * 100).toFixed(1)}%`
      : "Not reported";
  const latency =
    latestCheck?.latencyMs != null ? `${latestCheck.latencyMs}ms` : "Not reported";
  return (
    <Section icon={<Activity className="h-4 w-4" aria-hidden="true" />} title="Impact">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Fact label="Affected service" value={serviceName ?? "Not specified"} />
        <Fact label="Severity" value={INCIDENT_SEVERITY_LABEL[incident.severity]} />
        <Fact
          label="Duration"
          value={formatDuration(incident.detectedAt, incident.resolvedAt)}
        />
        <Fact
          label={incident.resolvedAt ? "Total open" : "Ongoing since"}
          value={formatRelativeTime(incident.detectedAt, now)}
        />
      </dl>
      <div className="mt-4 border-t border-border-hairline pt-4">
        <p className="mb-3 text-[13px] font-medium text-ink-secondary">
          Latest observed signal{" "}
          {latestCheck ? (
            <span className="font-mono text-[12px] text-ink-muted">
              ({latestCheck.source} · {formatRelativeTime(latestCheck.checkedAt, now)})
            </span>
          ) : null}
        </p>
        {latestCheck ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Fact label="Reported status" value={HEALTH_LABEL[latestCheck.status]} />
            <Fact label="Error rate" value={errorPct} />
            <Fact label="Latency" value={latency} />
            <Fact label="Reading source" value={latestCheck.source} />
          </dl>
        ) : (
          <p className="text-[13px] leading-5 text-ink-muted">
            No health-check readings recorded for this service yet.
          </p>
        )}
      </div>
    </Section>
  );
}

/** One titled AI field (Observation / Interpretation …), violet-labelled. */
function AiField({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ai">
        {title}
      </h3>
      <p className="text-[14px] leading-6 text-ink">{body}</p>
    </div>
  );
}

/**
 * AI analysis panel (§6, §11-13). Reserved violet (#7C3AED) marks it as
 * interpretation, visually distinct from observed telemetry. It renders the
 * stored, schema-validated analysis only — never raw model JSON — and the
 * suggested actions are proposals gated behind human approval.
 */
function AiAnalysisPanel({
  analysis,
  remediations,
}: {
  analysis: AiAnalysisRecord | null;
  remediations: RemediationAction[];
}) {
  return (
    <Card className="overflow-hidden border-ai-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ai-border bg-ai-tint px-5 py-3">
        <h2 className="inline-flex items-center gap-2 text-[16px] font-semibold text-ai">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          AI analysis
        </h2>
        {analysis ? (
          <span className="inline-flex items-center gap-2">
            <Badge
              tone={CONFIDENCE_TONE[analysis.confidence]}
              icon={<Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            >
              {CONFIDENCE_LABEL[analysis.confidence]}
            </Badge>
            {analysis.provider ? (
              <span className="font-mono text-[11px] text-ink-muted">
                {analysis.provider}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="p-5">
        {analysis ? (
          <AiAnalysisBody analysis={analysis} remediations={remediations} />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[14px] leading-6 text-ink-secondary">
              No AI analysis yet. Generating one reads only this incident&apos;s
              stored evidence — it never invents logs, metrics, or deployments,
              and it can only <strong className="font-medium text-ink">propose</strong>{" "}
              remediations for your approval.
            </p>
            <p className="text-[13px] text-ink-muted">
              Use “Generate AI analysis” above to produce one.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Renders the AI's cited evidence refs (stored jsonb) defensively. */
function AiEvidenceList({ refs }: { refs: unknown[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {refs.map((ref, i) => {
        const rec =
          ref && typeof ref === "object" ? (ref as Record<string, unknown>) : {};
        const statement = typeof rec.statement === "string" ? rec.statement : null;
        const source = typeof rec.source === "string" ? rec.source : null;
        if (!statement) return null;
        return (
          <li
            key={i}
            className="flex items-start gap-2 text-[13px] leading-5 text-ink-secondary"
          >
            <CircleDot className="mt-1 h-3 w-3 shrink-0 text-ai" aria-hidden="true" />
            <span>
              {source ? (
                <span className="font-mono text-[11px] uppercase text-ink-muted">
                  {source}{" "}
                </span>
              ) : null}
              {statement}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AiAnalysisBody({
  analysis,
  remediations,
}: {
  analysis: AiAnalysisRecord;
  remediations: RemediationAction[];
}) {
  const refs = Array.isArray(analysis.evidenceRefs)
    ? (analysis.evidenceRefs as unknown[])
    : [];
  return (
    <div className="flex flex-col gap-5">
      <AiField title="Observation" body={analysis.observation} />
      {refs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ai">
            Evidence cited
          </h3>
          <AiEvidenceList refs={refs} />
        </div>
      ) : null}
      <AiField title="Interpretation" body={analysis.interpretation} />
      {analysis.confidenceRationale ? (
        <AiField title="Why this confidence" body={analysis.confidenceRationale} />
      ) : null}
      <div className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ai">
          Suggested actions — your approval required
        </h3>
        {remediations.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {remediations.map((action) => (
              <RemediationControls key={action.id} action={action} />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-5 text-ink-muted">
            No automated remediation was proposed. Investigate using the evidence
            below.
          </p>
        )}
      </div>
      <p className="flex items-start gap-1.5 rounded-md border border-ai-border bg-ai-tint px-3 py-2 text-[12px] leading-5 text-ai">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {analysis.disclaimer}
      </p>
    </div>
  );
}

const EVIDENCE_SOURCE_ORDER: readonly EvidenceSource[] = [
  "metric",
  "log",
  "trace",
  "event",
  "config",
  "deployment",
];

const EVIDENCE_SOURCE_ICON: Record<EvidenceSource, typeof Gauge> = {
  metric: Gauge,
  log: FileText,
  trace: Activity,
  deployment: Rocket,
  event: MessageSquare,
  config: Lightbulb,
};

/**
 * Observed evidence (§6), grouped by source. This is the real recorded signal —
 * deliberately kept plain (no violet) so it reads as fact, distinct from the
 * AI's interpretation above. Deployment-source rows are pulled out separately
 * as "Related changes" (correlation, not proven cause).
 */
function EvidenceSection({
  evidence,
  now,
}: {
  evidence: IncidentEvidence[];
  now: number;
}) {
  const sources = EVIDENCE_SOURCE_ORDER.filter((s) =>
    evidence.some((e) => e.source === s),
  );
  return (
    <Section
      icon={<FileText className="h-4 w-4" aria-hidden="true" />}
      title="Evidence"
    >
      {evidence.length === 0 ? (
        <p className="text-[13px] leading-5 text-ink-muted">
          No evidence has been attached to this incident yet.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {sources.map((source) => {
            const items = evidence.filter((e) => e.source === source);
            const Icon = EVIDENCE_SOURCE_ICON[source];
            return (
              <div key={source} className="flex flex-col gap-2">
                <h3 className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
                  <Icon
                    className="h-3.5 w-3.5 shrink-0 text-ink-muted"
                    aria-hidden="true"
                  />
                  {EVIDENCE_SOURCE_LABEL[source]}
                </h3>
                <ul className="flex flex-col gap-2">
                  {items.map((item) => (
                    <EvidenceItem key={item.id} item={item} now={now} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/** One evidence row: label, optional detail, and when it was observed. */
function EvidenceItem({
  item,
  now,
  timePrefix = "",
}: {
  item: IncidentEvidence;
  now: number;
  timePrefix?: string;
}) {
  return (
    <li className="rounded-md border border-border-hairline bg-canvas px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium text-ink">{item.label}</span>
        {item.observedAt ? (
          <span className="font-mono text-[11px] text-ink-muted">
            {timePrefix}
            {formatRelativeTime(item.observedAt, now)}
          </span>
        ) : null}
      </div>
      {item.detail ? (
        <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
          {item.detail}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Deployment-source evidence shown as correlated changes (§6). Framed as
 * "occurred shortly before" — correlation in time, never a proven cause.
 */
function RelatedChangesSection({
  items,
  now,
}: {
  items: IncidentEvidence[];
  now: number;
}) {
  return (
    <Section
      icon={<Rocket className="h-4 w-4" aria-hidden="true" />}
      title="Related changes"
    >
      <p className="mb-3 text-[13px] leading-5 text-ink-secondary">
        Changes recorded around the time this incident began. Shown for context —
        correlation in time,{" "}
        <strong className="font-medium text-ink">not a proven cause</strong>.
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <EvidenceItem key={item.id} item={item} now={now} timePrefix="Occurred " />
        ))}
      </ul>
    </Section>
  );
}

const VERIFICATION_META: Record<
  VerificationStatus,
  { label: string; tone: Tone; icon: typeof ShieldCheck }
> = {
  running: { label: "In progress", tone: "info", icon: Clock },
  passed: { label: "Recovery confirmed", tone: "healthy", icon: ShieldCheck },
  failed: { label: "Not confirmed", tone: "critical", icon: ShieldX },
  cancelled: { label: "Cancelled", tone: "neutral", icon: ShieldX },
};

/**
 * Recovery verification runs (§17). A run stays "in progress" until the
 * required number of consecutive healthy checks pass; only then is recovery
 * confirmed. A single healthy reading is never enough to resolve.
 */
function VerificationSection({
  runs,
  now,
}: {
  runs: VerificationRun[];
  now: number;
}) {
  return (
    <Section
      icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
      title="Recovery verification"
    >
      <ul className="flex flex-col gap-3">
        {runs.map((run) => {
          const meta = VERIFICATION_META[run.status];
          const Icon = meta.icon;
          return (
            <li
              key={run.id}
              className="flex flex-col gap-2 rounded-md border border-border-hairline bg-canvas p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge
                  tone={meta.tone}
                  icon={<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                >
                  {meta.label}
                </Badge>
                <span className="font-mono text-[12px] text-ink-secondary">
                  {run.checksPassed} / {run.checksRequired} checks passed
                </span>
              </div>
              {run.detail ? (
                <p className="text-[13px] leading-5 text-ink-secondary">
                  {run.detail}
                </p>
              ) : null}
              <span className="font-mono text-[11px] text-ink-muted">
                Started {formatRelativeTime(run.startedAt, now)}
                {run.completedAt
                  ? ` · completed ${formatRelativeTime(run.completedAt, now)}`
                  : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

const EVENT_KIND_ICON: Record<EventKind, typeof CircleDot> = {
  detected: TriangleAlert,
  evidence: FileText,
  ai_analysis: Sparkles,
  remediation_proposed: Lightbulb,
  remediation_approved: ShieldCheck,
  remediation_rejected: ShieldX,
  remediation_applied: Play,
  verification: CircleDot,
  resolved: CircleCheck,
  note: MessageSquare,
};

const ACTOR_LABEL: Record<EventActor, string> = {
  system: "System",
  ai: "AI",
  user: "You",
};

/**
 * Incident timeline from recorded incident_events (§6) — the real audit trail
 * of what was observed and done, in chronological order. The AI actor is marked
 * in violet to stay consistent with the analysis panel.
 */
function Timeline({ events, now }: { events: IncidentEvent[]; now: number }) {
  return (
    <Section
      icon={<Clock className="h-4 w-4" aria-hidden="true" />}
      title="Timeline"
    >
      {events.length === 0 ? (
        <p className="text-[13px] leading-5 text-ink-muted">
          No timeline events recorded yet.
        </p>
      ) : (
        <ol className="flex flex-col">
          {events.map((event, i) => {
            const Icon = EVENT_KIND_ICON[event.kind];
            const last = i === events.length - 1;
            const isAi = event.actor === "ai";
            return (
              <li key={event.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                      isAi
                        ? "border-ai-border bg-ai-tint text-ai"
                        : "border-border-hairline bg-canvas text-ink-muted"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {!last ? (
                    <span
                      aria-hidden="true"
                      className="w-px flex-1 bg-border-hairline"
                    />
                  ) : null}
                </div>
                <div className={`flex flex-col gap-0.5 ${last ? "pb-1" : "pb-5"}`}>
                  <p className="text-[13px] leading-5 text-ink">{event.message}</p>
                  <span className="font-mono text-[11px] text-ink-muted">
                    <span className={isAi ? "font-medium text-ai" : ""}>
                      {ACTOR_LABEL[event.actor]}
                    </span>
                    {" · "}
                    {formatAbsoluteTime(event.at)} ·{" "}
                    {formatRelativeTime(event.at, now)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

/** Footer link to the full incident report (§19). */
function ReportFooter({
  projectId,
  incidentId,
}: {
  projectId: string;
  incidentId: string;
}) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 text-[16px] font-semibold text-ink">
          <FileText className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          Incident report
        </h2>
        <p className="text-[13px] leading-5 text-ink-secondary">
          A shareable summary of what was observed, interpreted, and done —
          printable, with a machine-readable export.
        </p>
      </div>
      <ButtonLink
        href={`/projects/${projectId}/incidents/${incidentId}/report`}
        variant="secondary"
      >
        View report
      </ButtonLink>
    </Card>
  );
}











