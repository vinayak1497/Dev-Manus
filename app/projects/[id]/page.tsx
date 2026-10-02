import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  ArrowLeft,
  Boxes,
  FlaskConical,
  GitBranch,
  Rocket,
  ServerCog,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { UserGreeting } from "@/components/auth/UserGreeting";
import { DatabaseSetupNotice } from "@/components/projects/DatabaseSetupNotice";
import {
  ProjectHealthBadge,
  ProjectHealthDot,
} from "@/components/projects/ProjectHealth";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/incidents/IncidentBadges";
import { OperationalControls } from "@/components/projects/OperationalControls";
import {
  labelStrategy,
  MonitoringConfiguration,
} from "@/components/projects/MonitoringConfiguration";
import { PRODUCT_NAME } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { USER_ID_HEADER } from "@/lib/supabase/middleware";
import { loadProjectConfig, type StoredProjectConfig } from "@/lib/project-config";
import {
  formatAbsoluteTime,
  formatRelativeTime,
  type ProjectHealth,
} from "@/lib/projects";
import {
  isActiveIncident,
  isMissingSchema,
  toIncident,
  toService,
  type Incident,
  type Service,
} from "@/lib/incidents";

// Resolved per request (session cookie) — never prerendered.
export const dynamic = "force-dynamic";

const HEALTH_VALUES: readonly ProjectHealth[] = [
  "healthy",
  "warning",
  "critical",
  "unknown",
  "maintenance",
  "recovering",
];

const PROJECT_COLUMNS =
  "id, name, slug, environment, repository, health, health_warning, last_checked_at, created_at, is_demo";

type ProjectDetail = {
  id: string;
  name: string;
  slug: string;
  environment: string | null;
  repository: string | null;
  health: ProjectHealth | null;
  warning: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  isDemo: boolean;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asHealth(value: unknown): ProjectHealth | null {
  return HEALTH_VALUES.includes(value as ProjectHealth)
    ? (value as ProjectHealth)
    : null;
}

/** Narrow the untrusted projects row into what the dashboard renders. */
function toProjectDetail(row: Record<string, unknown>): ProjectDetail {
  return {
    id: String(row.id),
    name: asText(row.name) ?? "Untitled project",
    slug: asText(row.slug) ?? String(row.id).slice(0, 8),
    environment: asText(row.environment),
    repository: asText(row.repository),
    health: asHealth(row.health),
    warning: asText(row.health_warning),
    lastCheckedAt: asText(row.last_checked_at),
    createdAt: asText(row.created_at) ?? new Date(0).toISOString(),
    isDemo: row.is_demo === true,
  };
}

/**
 * Project Dashboard (Screen_Navigation.md §7) — the landing screen inside a
 * project, reached from Projects Home or straight after the Add Project wizard.
 *
 * Everything is RLS-scoped: the project read returns a row only if the caller
 * is a member of its organization, so a not-found result (wrong id OR no
 * access) becomes an honest 404 — we never leak whether the project exists.
 * The operational tables (services/incidents) may not be migrated yet, so
 * those reads degrade gracefully instead of taking the whole page down.
 */
export default async function ProjectDashboardPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient().catch(() => null);

  if (!supabase) {
    return (
      <Shell>
        <Card className="flex items-start gap-3 border-warning-border bg-warning-tint p-4">
          <ProjectHealthDot health={null} className="mt-1.5 h-2.5 w-2.5" />
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
    // Middleware didn't run (should not happen) — fail closed, never open.
    redirect(`/login?next=/projects/${params.id}`);
  }

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", params.id)
    .maybeSingle();

  if (projectError) {
    // A hard read error usually means the base schema isn't installed.
    return (
      <Shell>
        <div role="alert">
          <DatabaseSetupNotice message={projectError.message} />
        </div>
      </Shell>
    );
  }

  if (!projectRow) notFound();

  const project = toProjectDetail(projectRow as Record<string, unknown>);

  // Operational tables may not be migrated yet — read them best-effort.
  const [servicesResult, incidentsResult] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, kind, status, description, is_demo")
      .eq("project_id", project.id)
      .order("name", { ascending: true }),
    supabase
      .from("incidents")
      .select(
        "id, service_id, title, summary, severity, status, detected_at, resolved_at, is_demo",
      )
      .eq("project_id", project.id)
      .order("detected_at", { ascending: false })
      .limit(50),
  ]);

  const operationalSchemaMissing =
    isMissingSchema(servicesResult.error?.code) ||
    isMissingSchema(incidentsResult.error?.code);

  const services: Service[] = (servicesResult.data ?? [])
    .map(toService)
    .filter((s): s is Service => s !== null);
  const incidents: Incident[] = (incidentsResult.data ?? [])
    .map(toIncident)
    .filter((i): i is Incident => i !== null);

  const activeIncidents = incidents.filter((i) => isActiveIncident(i.status));
  const now = Date.now();

  // Read back what onboarding actually stored, so the dashboard can state what
  // is being monitored instead of guessing. Best-effort: a project created
  // before this table existed simply has no configuration to show.
  const { config: stored, schemaMissing: configSchemaMissing } =
    await loadProjectConfig(project.id);

  return (
    <Shell>
      <Link
        href="/projects"
        className="inline-flex w-fit items-center gap-1.5 rounded text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All projects
      </Link>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <ProjectHealthDot health={project.health} className="h-3 w-3" />
            <h1 className="truncate text-[32px] font-semibold leading-10 tracking-tight text-ink">
              {project.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectHealthBadge health={project.health} />
            <span className="font-mono text-[12px] text-ink-muted">
              {project.slug}
            </span>
            {project.isDemo ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-ai-border bg-ai-tint px-2.5 py-1 font-mono text-[12px] font-medium leading-4 text-ai">
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                Sample data
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-secondary">
            <span className="inline-flex items-center gap-1.5">
              <ProjectHealthDot health={project.health} className="h-2 w-2" />
              {project.environment ?? "Environment not set"}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <GitBranch className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="truncate">
                {project.repository ?? "No repository connected"}
              </span>
            </span>
            <span className="font-mono text-[12px] text-ink-muted">
              Created {formatAbsoluteTime(project.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {project.warning ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-tint p-3"
        >
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <p className="text-[13px] leading-5 text-warning">{project.warning}</p>
        </div>
      ) : null}

      {operationalSchemaMissing ? (
        <div className="rounded-md border border-warning-border bg-warning-tint p-4">
          <p className="flex items-start gap-2 text-[14px] font-semibold text-warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Operational tables not installed</span>
          </p>
          <p className="mt-2 text-[14px] leading-6 text-ink-secondary">
            This project exists, but the services &amp; incidents tables
            haven&apos;t been migrated yet. Apply the latest migration, then
            reload.
          </p>
          <pre className="mt-3 overflow-x-auto rounded border border-warning-border bg-surface p-3 font-mono text-[12px] leading-5 text-ink">
            supabase db push
          </pre>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SummaryCard
          icon={<Boxes className="h-4 w-4" aria-hidden="true" />}
          title="Services"
          value={operationalSchemaMissing ? "—" : String(services.length)}
        >
          {operationalSchemaMissing ? (
            <p className="text-[13px] leading-5 text-ink-muted">
              Not available until the operational tables are installed.
            </p>
          ) : services.length === 0 ? (
            <p className="text-[13px] leading-5 text-ink-secondary">
              No services registered yet. Their health stays{" "}
              <strong className="font-medium text-ink">Unknown</strong> until a
              monitoring source reports on them.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {services.slice(0, 5).map((service) => (
                <li
                  key={service.id}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <ProjectHealthDot
                      health={service.status}
                      className="h-2 w-2"
                    />
                    <span className="truncate text-ink">{service.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-ink-muted">
                    {service.status ?? "unknown"}
                  </span>
                </li>
              ))}
              {services.length > 5 ? (
                <li className="text-[12px] text-ink-muted">
                  +{services.length - 5} more
                </li>
              ) : null}
            </ul>
          )}
        </SummaryCard>

        <SummaryCard
          icon={<ServerCog className="h-4 w-4" aria-hidden="true" />}
          title="Active incidents"
          value={operationalSchemaMissing ? "—" : String(activeIncidents.length)}
        >
          {operationalSchemaMissing ? (
            <p className="text-[13px] leading-5 text-ink-muted">
              Not available until the operational tables are installed.
            </p>
          ) : activeIncidents.length === 0 ? (
            <p className="text-[13px] leading-5 text-ink-secondary">
              No active incidents.
              {incidents.length > 0
                ? ` ${incidents.length} resolved on record.`
                : ""}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activeIncidents.slice(0, 4).map((incident) => (
                <li key={incident.id}>
                  <Link
                    href={`/projects/${project.id}/incidents/${incident.id}`}
                    className="-mx-2 flex flex-col gap-1 rounded-md px-2 py-1 transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    <span className="truncate text-[13px] font-medium text-ink">
                      {incident.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <IncidentSeverityBadge severity={incident.severity} />
                      <IncidentStatusBadge status={incident.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SummaryCard>

        <SummaryCard
          icon={<Rocket className="h-4 w-4" aria-hidden="true" />}
          title="Latest deployment"
          value={stored?.deployment?.strategy ? labelStrategy(stored.deployment.strategy) : "Not available"}
        >
          {stored?.deployment?.strategy ? (
            <>
              <p className="text-[13px] leading-5 text-ink-secondary">
                Configured to deploy via{" "}
                <strong className="font-medium text-ink">
                  {labelStrategy(stored.deployment.strategy)}
                </strong>
                . Deployment history appears once a deploy source is connected.
              </p>
              {stored.deployment.notes ? (
                <p className="text-[12px] leading-5 text-ink-muted">
                  {stored.deployment.notes}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] leading-5 text-ink-secondary">
              No deployment source is connected, so deployment history is{" "}
              <strong className="font-medium text-ink">Not available</strong>{" "}
              rather than assumed.
            </p>
          )}
          <p className="text-[12px] text-ink-muted">
            Last checked: {formatRelativeTime(project.lastCheckedAt, now)}
          </p>
        </SummaryCard>
      </div>

      {stored ? <MonitoringConfiguration config={stored} /> : null}

      {operationalSchemaMissing ? null : (
        <Card className="p-5">
          <div className="mb-3 flex flex-col gap-1">
            <h2 className="text-[16px] font-semibold text-ink">Operations</h2>
            <p className="text-[13px] leading-5 text-ink-secondary">
              Run a detection pass over this project. Detection observes the
              current signals and opens an incident only when it finds one —
              nothing here creates an incident directly.
            </p>
          </div>
          <OperationalControls
            projectId={project.id}
            devMode={process.env.NODE_ENV !== "production"}
            canRunConfiguredCheck={
              stored?.health?.method === "http" &&
              !!(stored.health.targetUrl && stored.health.endpoint)
            }
          />
        </Card>
      )}

      {operationalSchemaMissing ? null : (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-ink">Incidents</h2>
            <span className="font-mono text-[12px] text-ink-muted">
              {incidents.length} total · {activeIncidents.length} active
            </span>
          </div>
          {incidents.length === 0 ? (
            <p className="rounded border border-border-hairline bg-canvas p-4 text-[13px] leading-5 text-ink-secondary">
              No incidents recorded for this project yet. When a monitoring
              source or a controlled failure raises one, it will appear here with
              its evidence and timeline.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-hairline">
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <Link
                    href={`/projects/${project.id}/incidents/${incident.id}`}
                    className="-mx-2 flex flex-col gap-2 rounded-md px-2 py-3 transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-ink">
                          {incident.title}
                        </span>
                        {incident.isDemo ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-ai-border bg-ai-tint px-1.5 py-0.5 font-mono text-[10px] font-medium text-ai">
                            <FlaskConical className="h-3 w-3" aria-hidden="true" />
                            Sample
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-[12px] text-ink-muted">
                        Detected {formatRelativeTime(incident.detectedAt, now)}
                      </span>
                    </div>
                    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <IncidentSeverityBadge severity={incident.severity} />
                      <IncidentStatusBadge status={incident.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </Shell>
  );
}

/** Shared chrome for the project dashboard — product header + main column. */
function Shell({ children }: { children: React.ReactNode }) {
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
        {children}
      </main>
    </div>
  );
}

/** Overview tile: icon + title + a headline value, then arbitrary detail. */
function SummaryCard({
  icon,
  title,
  value,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-secondary">
          <span className="text-ink-muted">{icon}</span>
          {title}
        </span>
        <span className="text-[24px] font-semibold tabular-nums text-ink">
          {value}
        </span>
      </div>
      {children}
    </Card>
  );
}
