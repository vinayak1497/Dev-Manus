/**
 * Manual-check completion — the queue token is the proof.
 *
 * These tests pin the rule that keeps the queued confirmation honest:
 * a refresh alone is not completion. The persisted due time must no longer
 * equal the exact token written by the queue action.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveManualCheckCompletion,
  type ManualCheckSignal,
} from "../../lib/monitoring/manual-check-completion";

const QUEUED_AT = "2026-11-02T12:00:00.000Z";
const WORKER_DUE_AT = "2026-11-02T12:00:30.000Z";

function signal(
  overrides: Partial<ManualCheckSignal> = {},
): ManualCheckSignal {
  return {
    nextCheckAt: QUEUED_AT,
    hasMatchingObservation: false,
    hasError: false,
    ...overrides,
  };
}

test("stays pending while the persisted due time is still the queued token", () => {
  assert.deepEqual(deriveManualCheckCompletion(QUEUED_AT, signal()), {
    state: "pending",
  });
});

test("a refresh with unchanged state does not clear the message", () => {
  // This is the regression: router.refresh() alone must not be treated as
  // completion. Only the persisted due time moving is evidence.
  const refreshed = signal();
  assert.deepEqual(deriveManualCheckCompletion(QUEUED_AT, refreshed), {
    state: "pending",
  });
});

test("the same instant in a different timestamp format is still pending", () => {
  assert.deepEqual(
    deriveManualCheckCompletion(
      QUEUED_AT,
      signal({ nextCheckAt: "2026-11-02T12:00:00+00:00" }),
    ),
    { state: "pending" },
  );
});

test("a null or unreadable due time is not proof of completion", () => {
  assert.deepEqual(
    deriveManualCheckCompletion(QUEUED_AT, signal({ nextCheckAt: null })),
    { state: "pending" },
  );
  assert.deepEqual(
    deriveManualCheckCompletion(
      QUEUED_AT,
      signal({ nextCheckAt: "not-a-timestamp" }),
    ),
    { state: "pending" },
  );
});

test("a moved due time plus a matching observation completes as an observation", () => {
  assert.deepEqual(
    deriveManualCheckCompletion(
      QUEUED_AT,
      signal({
        nextCheckAt: WORKER_DUE_AT,
        hasMatchingObservation: true,
      }),
    ),
    { state: "completed", evidence: "observation" },
  );
});

test("a moved due time plus a worker error completes as a failure", () => {
  assert.deepEqual(
    deriveManualCheckCompletion(
      QUEUED_AT,
      signal({
        nextCheckAt: WORKER_DUE_AT,
        hasError: true,
      }),
    ),
    { state: "completed", evidence: "failure" },
  );
});

test("a worker error takes precedence over an older matching observation", () => {
  assert.deepEqual(
    deriveManualCheckCompletion(
      QUEUED_AT,
      signal({
        nextCheckAt: WORKER_DUE_AT,
        hasMatchingObservation: true,
        hasError: true,
      }),
    ),
    { state: "completed", evidence: "failure" },
  );
});

test("a moved due time with no observation or error is superseded", () => {
  assert.deepEqual(
    deriveManualCheckCompletion(
      QUEUED_AT,
      signal({ nextCheckAt: WORKER_DUE_AT }),
    ),
    { state: "completed", evidence: "superseded" },
  );
});

test("an invalid queued token stays pending", () => {
  assert.deepEqual(
    deriveManualCheckCompletion("not-a-timestamp", signal()),
    { state: "pending" },
  );
});
