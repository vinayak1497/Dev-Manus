/**
 * "Has the worker finished the manual check I queued?"
 *
 * The queue action writes the service's due time to a unique `queuedAt`
 * timestamp. The worker claims the service without touching that due time, so
 * while the request is waiting or running the persisted due time still equals
 * the queued token. A completed observation or a failed attempt that schedules
 * a retry writes a different due time.
 *
 * The caller must only evaluate this after a fresh server render. A refresh
 * alone is not evidence: the due time must have moved. Comparing by instant,
 * not by string, tolerates Postgres timestamp formatting. A null or
 * unparseable due time stays pending — an unreadable state is not proof of
 * completion.
 *
 * `hasMatchingObservation` and `hasError` describe the persisted worker
 * outcome. They are used only to label the completion; the due-time change is
 * what proves the queued request itself was consumed.
 */

export type ManualCheckSignal = {
  /** `services.monitoring_next_check_at` for the canonical service. */
  nextCheckAt: string | null;
  /** The latest external observation matches the saved configuration. */
  hasMatchingObservation: boolean;
  /** The worker persisted an error for the latest attempt. */
  hasError: boolean;
};

export type ManualCheckCompletion =
  | { state: "pending" }
  | {
      state: "completed";
      evidence: "observation" | "failure" | "superseded";
    };

export function deriveManualCheckCompletion(
  queuedAt: string,
  signal: ManualCheckSignal,
): ManualCheckCompletion {
  const queued = Date.parse(queuedAt);
  if (!Number.isFinite(queued)) return { state: "pending" };

  if (signal.nextCheckAt === null) return { state: "pending" };
  const next = Date.parse(signal.nextCheckAt);
  if (!Number.isFinite(next)) return { state: "pending" };

  // The exact queued token is still persisted: the worker has not consumed
  // the request. This is also why a bare router.refresh() cannot clear it.
  if (next === queued) return { state: "pending" };

  if (signal.hasError) {
    return { state: "completed", evidence: "failure" };
  }
  if (signal.hasMatchingObservation) {
    return { state: "completed", evidence: "observation" };
  }
  return { state: "completed", evidence: "superseded" };
}
