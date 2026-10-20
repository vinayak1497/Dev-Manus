/**
 * Worst-first project health rollup — the ONE ranking rule.
 *
 * This lived inside `lib/detection/monitor.ts` and is extracted here because a
 * second caller needs the same answer: the editable-health save path
 * (`lib/monitoring/health-edit.ts`) recomputes a project's rollup after the
 * monitored endpoint changes, so the dashboard cannot keep showing the previous
 * endpoint's "Healthy" badge as though it described the newly saved target.
 *
 * Copying the ranking there would have created exactly the kind of second,
 * drifting rule this repository forbids; the detection shell imports it back,
 * so both paths are provably identical.
 */
import type { ServiceStatus } from "../incidents";

/** Worst-first ranking used to roll individual services up to a project. */
const HEALTH_RANK: Record<ServiceStatus, number> = {
  critical: 5,
  warning: 4,
  recovering: 3,
  maintenance: 2,
  unknown: 1,
  healthy: 0,
};

/**
 * Reduce per-service statuses to one project status.
 *
 * A `null` service status counts as `unknown` (never as healthy): a service
 * with no evidence must not make a project look healthy.
 */
export function rollupHealth(
  statuses: readonly (ServiceStatus | null)[],
): ServiceStatus | null {
  if (statuses.length === 0) return null;
  let worst: ServiceStatus | null = null;
  for (const s of statuses) {
    const status = s ?? "unknown";
    if (worst === null || HEALTH_RANK[status] > HEALTH_RANK[worst]) {
      worst = status;
    }
  }
  return worst;
}
