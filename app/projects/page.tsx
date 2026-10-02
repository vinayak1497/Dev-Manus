import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Card } from "@/components/ui/Card";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { UserGreeting } from "@/components/auth/UserGreeting";
import { ProjectHealthDot } from "@/components/projects/ProjectHealth";
import { DatabaseSetupNotice } from "@/components/projects/DatabaseSetupNotice";
import { DemoDataControls } from "@/components/projects/DemoDataControls";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { RefreshProjectsButton } from "@/components/projects/RefreshProjectsButton";
import { AddProjectDialog } from "@/components/projects/AddProjectDialog";
import { PRODUCT_NAME } from "@/lib/site";
import type {
  DeploymentStatus,
  ProjectHealth,
  ProjectSummary,
} from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import { USER_ID_HEADER } from "@/lib/supabase/middleware";

// Resolved per request (session cookie) — never prerendered.
export const dynamic = "force-dynamic";

/**
 * Every column the Projects Home renders. Any field that is null is shown
 * as an explicit "not available" state — never a zero, never Healthy
 * (RULE.md §9.1 / §9.2).
 */
type ProjectRow = {
  id: string;
  name: string | null;
  slug: string | null;
  created_at: string | null;
  environment: string | null;
  repository: string | null;
  health: string | null;
  service_count: number | null;
  active_incident_count: number | null;
  last_checked_at: string | null;
  health_warning: string | null;
  deployment_version: string | null;
  deployment_commit: string | null;
  deployment_status: string | null;
  deployed_at: string | null;
  is_demo: boolean | null;
};

const PROJECT_COLUMNS =
  "id, name, slug, created_at, environment, repository, health, service_count, active_incident_count, last_checked_at, health_warning, deployment_version, deployment_commit, deployment_status, deployed_at, is_demo";

const HEALTH_VALUES = [
  "healthy",
  "warning",
  "critical",
  "unknown",
  "maintenance",
  "recovering",
] as const;

const DEPLOYMENT_VALUES = ["success", "failed", "running", "unknown"] as const;

function isProjectRow(value: unknown): value is ProjectRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string";
}

/** External/DB values are untrusted — narrow them before rendering. */
function asHealth(value: unknown): ProjectHealth | null {
  return HEALTH_VALUES.includes(value as ProjectHealth)
    ? (value as ProjectHealth)
    : null;
}

function asDeploymentStatus(
  value: unknown,
): DeploymentStatus | null {
  return DEPLOYMENT_VALUES.includes(value as DeploymentStatus)
    ? (value as DeploymentStatus)
    : null;
}

function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toSummaries(rows: unknown[]): ProjectSummary[] {
  return rows.filter(isProjectRow).map((row) => {
    const version = asText(row.deployment_version);
    const deployedAt = asText(row.deployed_at);
    return {
      id: row.id,
      name: asText(row.name) ?? "Untitled project",
      slug: asText(row.slug) ?? row.id.slice(0, 8),
      createdAt: asText(row.created_at) ?? new Date(0).toISOString(),
      health: asHealth(row.health),
      environment: asText(row.environment),
      repository: asText(row.repository),
      serviceCount: asCount(row.service_count),
      activeIncidentCount: asCount(row.active_incident_count),
      lastCheckedAt: asText(row.last_checked_at),
      deployment:
        version === null
          ? null
          : {
              version,
              commit: asText(row.deployment_commit),
              status: asDeploymentStatus(row.deployment_status) ?? "unknown",
              deployedAt: deployedAt ?? new Date(0).toISOString(),
            },
      warning: asText(row.health_warning),
      isDemo: row.is_demo === true,
    };
  });
}

/**
 * Projects Home (Screen_Navigation.md §6) — first screen after
 * authentication. Design reference: Stitch Designs/User_Profile/code.html.
 *
 * Middleware already verified the session and redirects unauthenticated
 * users. We read its verified user id from the request header rather than
 * re-calling `auth.getUser()` — that duplicate call cost a full network
 * round trip on every page load.
 */
export default async function ProjectsPage() {
  let displayName: string | null = null;
  let projects: ProjectSummary[] = [];
  let isConfigured = true;
  let loadError: React.ReactNode = null;

  // createClient() throws when env keys are missing — that is a config
  // problem, not an auth failure, so it must not redirect.
  const supabase = await createClient().catch(() => null);

  if (!supabase) {
    isConfigured = false;
  } else {
    const userId = (await headers()).get(USER_ID_HEADER);

    if (!userId) {
      // Middleware didn't run (should not happen) — fail closed, never open.
      redirect("/login?next=/projects");
    }

    // Display name comes from the local profile table; a missing table must
    // not break the page, so this read is best-effort and never awaited
    // before the projects query.
    const [profile, projectsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("projects")
        .select(PROJECT_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const name = profile.data?.display_name;
    displayName = typeof name === "string" ? name.trim() || null : null;

    if (projectsResult.error) {
      loadError = (
        <DatabaseSetupNotice message={projectsResult.error.message} />
      );
    } else {
      projects = toSummaries(projectsResult.data ?? []);
    }
  }

  const loadedAt = new Date().toISOString();
  const now = Date.parse(loadedAt);

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex h-16 max-w-app items-center justify-between gap-4 border-b border-border-hairline px-4 lg:px-8">
        <span className="flex items-center gap-2" aria-label={PRODUCT_NAME}>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded bg-brand font-mono text-[14px] font-semibold text-white"
          >
            DS
          </span>
          <span className="text-[16px] font-semibold tracking-tight text-ink">
            {PRODUCT_NAME}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <UserGreeting fallback={displayName} />
          <SignOutButton />
        </span>
      </header>

      <main
        id="main-content"
        className="mx-auto flex max-w-app flex-col gap-6 px-4 pb-16 pt-8 lg:px-8"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex flex-col gap-1">
            <h1 className="text-[32px] font-semibold leading-10 tracking-tight text-ink">
              Projects
            </h1>
            <p className="max-w-2xl text-[14px] leading-6 text-ink-secondary">
              Manage and monitor the applications connected to{" "}
              {PRODUCT_NAME}.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <AddProjectDialog navigateOnCreate />
            <RefreshProjectsButton />
          </div>
        </div>

        {process.env.NODE_ENV === "development" ? (
          <DemoDataControls />
        ) : null}

        {!isConfigured ? (
          <Card className="flex items-start gap-3 border-warning-border bg-warning-tint p-4">
            <ProjectHealthDot health={null} className="mt-1.5 h-2.5 w-2.5" />
            <p className="text-[14px] leading-6 text-warning">
              Authentication isn&apos;t configured yet. Add the Supabase keys to{" "}
              <code className="font-mono text-[13px]">.env.local</code> (see{" "}
              <code className="font-mono text-[13px]">Docs/Auth-Resend-SMTP.md</code>
              ).
            </p>
          </Card>
        ) : null}

        {loadError ? (
          <div role="alert">{loadError}</div>
        ) : (
          <ProjectsView
            projects={projects}
            now={now}
            loadedAt={loadedAt}
            emptyStateAction={
              <AddProjectDialog
                triggerLabel="Add your first project"
                navigateOnCreate
              />
            }
            notice={
              projects.length > 0 && !projects.some((p) => p.health !== null) ? (
                <p className="flex items-start gap-2 rounded border border-border-hairline bg-surface p-3 text-[13px] leading-5 text-ink-secondary">
                  <ProjectHealthDot health={null} className="mt-1.5 h-2.5 w-2.5" />
                  <span>
                    No monitoring source is connected to these projects yet, so
                    their health is <strong className="font-medium text-ink">Unknown</strong>{" "}
                    rather than healthy. Fields without a source show{" "}
                    <strong className="font-medium text-ink">
                      Not available
                    </strong>{" "}
                    instead of a placeholder number.
                  </span>
                </p>
              ) : null
            }
          />
        )}
      </main>
    </div>
  );
}
