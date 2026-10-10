import { Activity, CalendarClock, Settings2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DependencyBadge } from "@/components/onboarding/ProvenanceBadge";
import { deploymentStrategyLabel } from "@/lib/onboarding/deployment";
import { buildHealthCheckUrl, HEALTH_TARGET_TYPE_LABEL } from "@/lib/onboarding/health";
import type { DependencyStatus, HealthTargetType } from "@/lib/onboarding/types";
import { formatRelativeTime } from "@/lib/projects";
import type { AutomaticMonitoringView } from "@/lib/monitoring/automatic-state";
import type {
  StoredProjectConfig,
  MonitoringStatus,
} from "@/lib/project-config";

export function labelStrategy(strategy: string): string {
  return deploymentStrategyLabel(strategy);
}

type DepKey = "postgres" | "mysql" | "mongodb" | "redis";

const DEP_LABEL: Record<DepKey, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  redis: "Redis",
};

/** Monitoring status as an honest sentence, never as an implied "Healthy". */
function statusNote(status: MonitoringStatus): { label: string; tone: "unknown" | "healthy" | "warning" | "neutral" } {
  switch (status) {
    case "active":
      return { label: "Monitoring", tone: "healthy" };
    case "degraded":
      return { label: "Degraded", tone: "warning" };
    case "unknown":
      return { label: "Monitoring state unknown", tone: "neutral" };
    case "pending":
    default:
      return { label: "First check pending", tone: "unknown" };
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border-hairline py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="shrink-0 text-[13px] text-ink-secondary">{label}</span>
      <span className="truncate font-mono text-[13px] text-ink">{value}</span>
    </div>
  );
}

/**
 * The honest state of AUTOMATIC monitoring, read from the rows the worker
 * actually wrote.
 *
 * Deliberately never says "the worker is running": there is no heartbeat to
 * prove it, and a configuration flag is not evidence of a live process. What
 * it does say is what the schedule says — when the last real check happened,
 * when the next one is due, and whether that due time has passed without the
 * check arriving (which is what "monitoring has stopped" actually looks like
 * from the outside). Every unknown renders as an explicit "—"/"Unknown",
 * never as a reassuring default.
 */
function AutomaticMonitoringPanel({
  automatic,
  now,
  activeIncidents,
}: {
  automatic: AutomaticMonitoringView;
  now: number;
  activeIncidents: number;
}) {
  if (!automatic.configured) {
    return (
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <CalendarClock className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
          Automatic monitoring
        </h3>
        <p className="text-[13px] leading-5 text-ink-muted">
          Not configured. Set an HTTP target URL and endpoint path in onboarding
          to have this endpoint checked on a schedule.
        </p>
      </section>
    );
  }

  const enabled = automatic.enabled;
  const badge =
    enabled === false
      ? { label: "Automatic monitoring off", tone: "neutral" as const }
      : automatic.stale
        ? { label: "Checks overdue", tone: "warning" as const }
        : automatic.lastCheckedAt
          ? { label: "Automatic", tone: "healthy" as const }
          : { label: "Waiting for first check", tone: "unknown" as const };

  return (
    <section className="lg:col-span-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <CalendarClock className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
        Automatic monitoring
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </h3>
      <div className="flex flex-col">
        <Row
          label="Last real check"
          value={
            automatic.lastCheckedAt
              ? `${formatRelativeTime(automatic.lastCheckedAt, now)} (${automatic.lastStatus ?? "unknown"})`
              : "No check has run yet"
          }
        />
        <Row
          label="Next scheduled check"
          value={
            automatic.nextCheckAt
              ? formatRelativeTime(automatic.nextCheckAt, now)
              : "Not scheduled"
          }
        />
        <Row
          label="Latest HTTP result"
          value={
            automatic.lastStatusCode === null
              ? "Not available"
              : automatic.lastStatusCode === 0 || automatic.lastDetail?.includes("no response")
                ? "No response"
                : `HTTP ${automatic.lastStatusCode}`
          }
        />
        <Row
          label="Consecutive failures"
          value={
            automatic.consecutiveFailures === null
              ? "Not available"
              : `${automatic.consecutiveFailures} of ${automatic.failureThreshold ?? "?"} to alert`
          }
        />
        <Row
          label="Open incident"
          value={
            activeIncidents > 0
              ? `${activeIncidents} open`
              : automatic.consecutiveFailures === null
                ? "Not available"
                : "None"
          }
        />
      </div>
      {automatic.stale ? (
        <p
          role="status"
          className="mt-2 flex items-start gap-1.5 text-[12px] leading-5 text-warning"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          The next scheduled check is overdue and no newer observation has been
          recorded, so automatic checks appear to have stopped. This usually
          means the monitoring worker is not running or cannot reach the
          database.
        </p>
      ) : null}
      {automatic.lastError ? (
        <p role="status" className="mt-2 text-[12px] leading-5 text-critical">
          Last scheduler error: {automatic.lastError}
        </p>
      ) : null}
      {enabled === false ? (
        <p className="mt-2 text-[12px] leading-5 text-ink-muted">
          Automatic monitoring is switched off for this project. The stored
          configuration is kept; re-enabling it restores the same schedule.
        </p>
      ) : null}
    </section>
  );
}

/**
 * "What did onboarding actually store?" — the read-back half of the
 * UI → state → persistence → Supabase loop.
 *
 * Rules honoured here:
 * - Secret VALUES are never read (see `loadProjectConfig`), so only counts and
 *   names can be shown.
 * - Absent values render as "Not set" / "Not detected", never as a default
 *   that could be mistaken for a detected value (RULE.md §9.2).
 */
export function MonitoringConfiguration({
  config,
  automatic,
  now = Date.now(),
  activeIncidents = 0,
}: {
  config: StoredProjectConfig;
  /** Real scheduler state; omitted means "automatic monitoring not inspected". */
  automatic?: AutomaticMonitoringView;
  now?: number;
  activeIncidents?: number;
}) {
  const note = statusNote(config.monitoringStatus);
  const deps = config.dependencies;
  const health = config.health;
  const runtime = config.runtime;

  const checkUrl = health && health.method === "http" ? buildHealthCheckUrl(health.targetUrl ?? "", health.endpoint ?? "").url : null;
  const dependencyRows = deps
    ? (Object.keys(DEP_LABEL) as DepKey[]).map((key) => ({
        key,
        label: DEP_LABEL[key],
        status: deps[key] as DependencyStatus | null,
      }))
    : [];

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-semibold text-ink">
            Monitoring configuration
          </h2>
          <Badge tone={note.tone} icon={<Activity className="h-3 w-3" aria-hidden="true" />}>
            {note.label}
          </Badge>
        </div>
        <p className="text-[13px] leading-5 text-ink-secondary">
          Exactly what onboarding stored for this project.
          {config.monitoringStatus === "pending" ? (
            <>
              {" "}
              Health stays <strong className="font-medium text-ink">Unknown</strong>{" "}
              until the first check reports — configuring a check is not the
              same as having run one.
            </>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Settings2 className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
            Runtime
          </h3>
          {runtime ? (
            <div className="flex flex-col">
              <Row label="Runtime" value={runtime.runtime ?? "Not detected"} />
              <Row
                label="Production start"
                value={
                  runtime.startCommand ??
                  (config.deployment?.strategy === "kubernetes" || config.deployment?.strategy === "helm"
                    ? "Deployment-managed (not stored)"
                    : "Not set")
                }
              />
              <Row label="Build" value={runtime.buildCommand ?? "Not set"} />
              <Row label="Development" value={runtime.devCommand ?? "Not set"} />
              <Row label="Port" value={runtime.port ?? "Not set"} />
            </div>
          ) : (
            <p className="text-[13px] leading-5 text-ink-muted">
              No runtime configuration was stored.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Health check</h3>
          {health ? (
            <div className="flex flex-col">
              <Row label="Method" value={health.method ?? "Not set"} />
              {health.method === "http" ? (
                <>
                  <Row
                    label="Target type"
                    value={
                      health.targetType
                        ? HEALTH_TARGET_TYPE_LABEL[health.targetType as HealthTargetType] ?? health.targetType
                        : "Not set"
                    }
                  />
                  <Row label="Target URL" value={health.targetUrl ?? "Not set"} />
                  <Row label="Endpoint path" value={health.endpoint ?? "Not set"} />
                  <Row label="Checked URL" value={checkUrl ?? "Not set"} />
                </>
              ) : (
                <Row
                  label={health.method === "port" ? "Port" : "Endpoint"}
                  value={health.endpoint ?? (health.method === "port" ? "Not set" : "Not set")}
                />
              )}
              <Row label="Expect status" value={health.expectedStatus ?? "Not set"} />
              <Row
                label="Interval"
                value={health.intervalSec ? `${health.intervalSec}s` : "Not set"}
              />
              <Row
                label="Timeout"
                value={health.timeoutSec ? `${health.timeoutSec}s` : "Not set"}
              />
              <Row
                label="Failures to alert"
                value={health.failureThreshold ?? "Not set"}
              />
            </div>
          ) : (
            <p className="text-[13px] leading-5 text-ink-muted">
              No health check has been configured.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">Environment</h3>
          <div className="flex flex-col">
            <Row label="Variables" value={String(config.envVarCount)} />
            <Row label="Secrets" value={String(config.secretCount)} />
            <Row label="Branch" value={config.branch ?? "Not set"} />
            <Row
              label="Repository"
              value={config.repositoryProvider ?? "Not set"}
            />
          </div>
          {config.secretCount > 0 ? (
            <p className="mt-2 text-[12px] leading-5 text-ink-muted">
              {config.secretNames.length === 1
                ? "1 secret name stored — "
                : `${config.secretCount} secret names stored — `}
              values are never stored or displayed.
            </p>
          ) : null}

          {dependencyRows.length > 0 ? (
            <>
              <h3 className="mb-2 mt-4 text-[13px] font-semibold text-ink">
                Dependencies
              </h3>
              <ul className="flex flex-col gap-1.5">
                {dependencyRows.map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-[13px] text-ink-secondary">{row.label}</span>
                    {row.status ? (
                      <DependencyBadge status={row.status} />
                    ) : (
                      <span className="text-[12px] text-ink-muted">Not detected</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-5 text-ink-muted">
                A client library alone only means the code could use it, so it
                reports as Not confirmed rather than Detected.
              </p>
            </>
          ) : null}
        </section>

        {automatic ? (
          <AutomaticMonitoringPanel
            automatic={automatic}
            now={now}
            activeIncidents={activeIncidents}
          />
        ) : null}
      </div>
    </Card>
  );
}