/**
 * "Does this observation describe the configuration that is saved NOW?"
 *
 * The canonical monitored service is one row per project, so its observation
 * history survives an endpoint change. That is good for the audit trail and bad
 * for the dashboard: immediately after saving `/status/500`, the newest
 * observation still belongs to `/` and used to be rendered as "Latest HTTP
 * result: HTTP 200" — a result for a URL nobody is checking any more.
 *
 * Every genuine external observation records the exact `checked_url` and the
 * `expected_status` it was judged against (`buildExternalObservation`). This
 * pure predicate compares those facts with the stored configuration, so the
 * dashboard can show "Not available yet" until a real observation of the new
 * target exists. Nothing is deleted: the history remains evidence, it is simply
 * not presented as the current result.
 */
import { buildHealthCheckUrl } from "../onboarding/health";
import type { StoredHealth } from "../onboarding/stored-config";
import { readExpectedStatus } from "./health-settings";

export type ObservationMetadata = {
  checked_url?: unknown;
  expected_status?: unknown;
} | null;

/**
 * True only when the observation was taken against the current URL AND judged
 * against the current expected status.
 *
 * Stricter than a "best effort" match on purpose: when a legacy row lacks the
 * metadata, the honest answer is "this does not prove anything about the
 * current configuration", not "probably fine".
 */
export function observationMatchesHealth(
  metadata: ObservationMetadata,
  health: StoredHealth | null,
): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  if (!health || health.method !== "http") return false;

  const built = buildHealthCheckUrl(health.targetUrl ?? "", health.endpoint ?? "");
  if (!built.url) return false;

  if (typeof metadata.checked_url !== "string" || metadata.checked_url !== built.url) {
    return false;
  }

  const expected = readExpectedStatus(health);
  if (expected === null) return false;

  return (
    typeof metadata.expected_status === "number" && metadata.expected_status === expected
  );
}
