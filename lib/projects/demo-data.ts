import type {
  DeploymentStatus,
  ProjectHealth,
  ProjectSummary,
} from "@/lib/projects";

/**
 * Sample data for demos and UI review.
 *
 * NOT telemetry. RULE.md §9.1 and Design.md Rule 8 require that any
 * development/mock operational data be clearly identifiable as such, so:
 *   - every row is written with `is_demo = true`
 *   - the Projects Home renders a "Demo data" banner and per-card badge
 *   - nothing here is ever presented as production telemetry
 *
 * Names mirror the approved Stitch design so the demo matches what was
 * signed off. Values are illustrative only.
 */
export type DemoProjectSeed = {
  slug: string;
  name: string;
  environment: string | null;
  repository: string | null;
  health: ProjectHealth;
  serviceCount: number | null;
  activeIncidentCount: number | null;
  healthWarning: string | null;
  deploymentVersion: string | null;
  deploymentCommit: string | null;
  deploymentStatus: DeploymentStatus | null;
  /** Minutes ago the deployment happened. */
  deployedMinutesAgo: number | null;
  /** Seconds ago telemetry was last read. */
  checkedSecondsAgo: number;
  /** Days ago the project was created. */
  createdDaysAgo: number;
};

export const DEMO_ORG_NAME = "Demo Workspace";

export const DEMO_PROJECTS: DemoProjectSeed[] = [
  {
    slug: "shopeasy",
    name: "ShopEasy",
    environment: "Production",
    repository: "github.com/company/shopeasy",
    health: "healthy",
    serviceCount: 12,
    activeIncidentCount: 0,
    healthWarning: null,
    deploymentVersion: "v1.8.2",
    deploymentCommit: "a8f302",
    deploymentStatus: "success",
    deployedMinutesAgo: 24,
    checkedSecondsAgo: 12,
    createdDaysAgo: 41,
  },
  {
    slug: "payments-api",
    name: "Payments API",
    environment: "Production",
    repository: "github.com/company/payments-service",
    health: "warning",
    serviceCount: 8,
    activeIncidentCount: 2,
    healthWarning:
      "High query queue contention on orders_db (latency +42%)",
    deploymentVersion: "v2.4.0",
    deploymentCommit: "f41c9b",
    deploymentStatus: "success",
    deployedMinutesAgo: 120,
    checkedSecondsAgo: 4,
    createdDaysAgo: 33,
  },
  {
    slug: "analytics-engine",
    name: "Analytics Platform",
    environment: "Production",
    repository: "github.com/company/analytics-engine",
    health: "critical",
    serviceCount: 15,
    activeIncidentCount: 1,
    healthWarning: "PostgreSQL pool exhausted on worker-node-04",
    deploymentVersion: "v1.1.9",
    deploymentCommit: "e3290b",
    deploymentStatus: "failed",
    deployedMinutesAgo: 8,
    checkedSecondsAgo: 2,
    createdDaysAgo: 27,
  },
  {
    slug: "marketing-web",
    name: "Marketing Platform",
    environment: "Staging",
    repository: "github.com/company/marketing-web",
    health: "healthy",
    serviceCount: 6,
    activeIncidentCount: 0,
    healthWarning: null,
    deploymentVersion: "v3.12.0",
    deploymentCommit: "c4819a",
    deploymentStatus: "success",
    deployedMinutesAgo: 240,
    checkedSecondsAgo: 35,
    createdDaysAgo: 18,
  },
  {
    slug: "auth-core",
    name: "Identity & Auth Core",
    environment: "Production",
    repository: "github.com/company/auth-core",
    health: "healthy",
    serviceCount: 4,
    activeIncidentCount: 0,
    healthWarning: null,
    deploymentVersion: "v4.0.1",
    deploymentCommit: "9b224e",
    deploymentStatus: "success",
    deployedMinutesAgo: 1440,
    checkedSecondsAgo: 18,
    createdDaysAgo: 62,
  },
  {
    slug: "notifications-worker",
    name: "Notification Dispatcher",
    environment: "Production",
    repository: "github.com/company/notifications-worker",
    health: "warning",
    serviceCount: 5,
    activeIncidentCount: 1,
    healthWarning: "SendGrid queue retry threshold exceeded (p99 1.2s)",
    deploymentVersion: "v1.9.4",
    deploymentCommit: "71ec0a",
    deploymentStatus: "success",
    deployedMinutesAgo: 300,
    checkedSecondsAgo: 60,
    createdDaysAgo: 12,
  },
];

/** Materialise a seed row into the shape the Projects Home consumes. */
export function toProjectSummary(
  seed: DemoProjectSeed,
  now: number,
): ProjectSummary {
  const deployedAt =
    seed.deployedMinutesAgo === null
      ? null
      : new Date(now - seed.deployedMinutesAgo * 60_000).toISOString();

  return {
    id: seed.slug,
    name: seed.name,
    slug: seed.slug,
    createdAt: new Date(now - seed.createdDaysAgo * 86_400_000).toISOString(),
    health: seed.health,
    environment: seed.environment,
    repository: seed.repository,
    serviceCount: seed.serviceCount,
    activeIncidentCount: seed.activeIncidentCount,
    lastCheckedAt: new Date(
      now - seed.checkedSecondsAgo * 1000,
    ).toISOString(),
    deployment:
      seed.deploymentVersion === null
        ? null
        : {
            version: seed.deploymentVersion,
            commit: seed.deploymentCommit,
            status: seed.deploymentStatus ?? "unknown",
            deployedAt: deployedAt ?? new Date(now).toISOString(),
          },
    warning: seed.healthWarning,
    isDemo: true,
  };
}
