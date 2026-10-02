/**
 * Projects Home domain model (Screen_Navigation.md §6).
 *
 * Data-integrity contract (RULE.md §9 / Design.md §43):
 * every operational field below is `null` until a real telemetry source
 * exists. The UI must render those as explicit "not available" states —
 * never as zero, never as healthy, never as invented numbers.
 */

export type ProjectHealth =
  | "healthy"
  | "warning"
  | "critical"
  | "unknown"
  | "maintenance"
  | "recovering";

export type HealthFilter = ProjectHealth | "all";

export type DeploymentStatus = "success" | "failed" | "running" | "unknown";

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  /** Null until monitoring is connected (RULE.md §9.2 — never assume). */
  health: ProjectHealth | null;
  environment: string | null;
  repository: string | null;
  serviceCount: number | null;
  activeIncidentCount: number | null;
  lastCheckedAt: string | null;
  deployment: {
    version: string;
    commit: string | null;
    status: DeploymentStatus;
    deployedAt: string;
  } | null;
  /** Free-text warning surfaced on the card; never fabricated. */
  warning: string | null;
  /**
   * True for seeded sample rows. The UI must label these as demo data —
   * mock operational data may never read as real telemetry
   * (RULE.md §9.1 / Design.md Rule 8).
   */
  isDemo?: boolean;
};

export const HEALTH_ORDER: Record<ProjectHealth, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  recovering: 3,
  maintenance: 4,
  healthy: 5,
};

export const HEALTH_LABEL: Record<ProjectHealth, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
  maintenance: "Maintenance",
  recovering: "Recovering",
};

/** Non-colour status indicator, required alongside every badge (RULE.md §6.4). */
export const HEALTH_SYMBOL: Record<ProjectHealth, string> = {
  healthy: "●",
  warning: "▲",
  critical: "✕",
  unknown: "?",
  maintenance: "⚑",
  recovering: "↻",
};

export type SortKey =
  | "recent"
  | "criticality"
  | "alphabetical"
  | "services";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recently updated" },
  { key: "criticality", label: "Criticality / Incidents" },
  { key: "alphabetical", label: "Alphabetical (A-Z)" },
  { key: "services", label: "Services count" },
];

export const ENVIRONMENT_OPTIONS = [
  "Development",
  "Staging",
  "Production",
] as const;

export type CreateProjectState = {
  ok: boolean;
  error: string | null;
  projectId?: string;
  fieldErrors?: { name?: string; environment?: string; repository?: string };
};

export const INITIAL_CREATE_STATE: CreateProjectState = {
  ok: false,
  error: null,
};

function timeValue(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortProjects(
  projects: ProjectSummary[],
  sort: SortKey,
): ProjectSummary[] {
  const list = [...projects];
  switch (sort) {
    case "criticality":
      return list.sort((a, b) => {
        const byHealth =
          (HEALTH_ORDER[a.health ?? "unknown"] ?? 2) -
          (HEALTH_ORDER[b.health ?? "unknown"] ?? 2);
        if (byHealth !== 0) return byHealth;
        return (b.activeIncidentCount ?? 0) - (a.activeIncidentCount ?? 0);
      });
    case "alphabetical":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "services":
      return list.sort(
        (a, b) => (b.serviceCount ?? 0) - (a.serviceCount ?? 0),
      );
    case "recent":
    default:
      return list.sort(
        (a, b) =>
          Math.max(timeValue(b.lastCheckedAt), timeValue(b.createdAt)) -
          Math.max(timeValue(a.lastCheckedAt), timeValue(a.createdAt)),
      );
  }
}

export function filterProjects(
  projects: ProjectSummary[],
  filters: { search: string; health: HealthFilter; environment: string },
): ProjectSummary[] {
  const term = filters.search.trim().toLowerCase();

  return projects.filter((project) => {
    const matchesSearch =
      term.length === 0 ||
      project.name.toLowerCase().includes(term) ||
      project.slug.toLowerCase().includes(term) ||
      (project.repository ?? "").toLowerCase().includes(term);

    // Null health renders and counts as "Unknown" (see countByHealth and
    // ProjectHealth's resolveHealth), so the filter must treat it the same
    // way — otherwise selecting "Unknown" would exclude the very rows the
    // summary tile counted as unknown.
    const projectHealth = project.health ?? "unknown";
    const matchesHealth =
      filters.health === "all" || projectHealth === filters.health;

    const matchesEnvironment =
      filters.environment === "all" ||
      project.environment === filters.environment;

    return matchesSearch && matchesHealth && matchesEnvironment;
  });
}

export function countByHealth(projects: ProjectSummary[]) {
  const counts: Record<ProjectHealth, number> = {
    healthy: 0,
    warning: 0,
    critical: 0,
    unknown: 0,
    maintenance: 0,
    recovering: 0,
  };
  for (const project of projects) {
    if (project.health) counts[project.health] += 1;
    else counts.unknown += 1;
  }
  return counts;
}

/** "24m ago" — compact, human, and honest about missing timestamps. */
export function formatRelativeTime(iso: string | null, now: number): string {
  if (!iso) return "Never checked";
  const ms = now - timeValue(iso);
  if (ms <= 0) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** Deterministic server/client rendering — both sides use UTC. */
export function formatAbsoluteTime(iso: string | null): string {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return `${dateTimeFormat.format(new Date(parsed))} UTC`;
}
