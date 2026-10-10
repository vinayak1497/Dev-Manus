/**
 * `failureThreshold` applied inside the detection core.
 *
 * Phase 1 opened an incident on the first unhealthy observation. Phase 2
 * gates that on the configured number of consecutive GENUINE failures — while
 * leaving every other reconcile rule untouched, which is what the assertions
 * at the bottom of this file prove.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileService,
  DEFAULT_VERIFICATION_CHECKS,
  type ReconcileInput,
} from "../../lib/detection/reconcile";

function base(overrides: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    service: { id: "s1", name: "Application endpoint", currentStatus: "healthy" },
    observedStatus: "healthy",
    activeIncident: null,
    activeVerification: null,
    ...overrides,
  };
}

const openIncident = { id: "inc1", status: "open" as const, severity: "critical" as const };

test("threshold 1 opens an incident on the first qualifying failure", () => {
  const r = reconcileService(
    base({ observedStatus: "critical", failureGate: { consecutiveFailures: 1, threshold: 1 } }),
  );
  assert.equal(r.action.type, "open_incident");
  assert.equal(r.serviceStatus, "critical");
});

test("threshold 3 holds after the first consecutive failure", () => {
  const r = reconcileService(
    base({ observedStatus: "critical", failureGate: { consecutiveFailures: 1, threshold: 3 } }),
  );
  assert.equal(r.action.type, "below_threshold");
  if (r.action.type === "below_threshold") {
    assert.equal(r.action.consecutiveFailures, 1);
    assert.equal(r.action.threshold, 3);
    assert.equal(r.action.observedStatus, "critical");
  }
  // The real failure is still visible on the service — it is not hidden
  // behind a "still healthy" badge while the threshold is pending.
  assert.equal(r.serviceStatus, "critical");
});

test("threshold 3 holds after the second consecutive failure", () => {
  const r = reconcileService(
    base({ observedStatus: "critical", failureGate: { consecutiveFailures: 2, threshold: 3 } }),
  );
  assert.equal(r.action.type, "below_threshold");
});

test("threshold 3 opens an incident on the third consecutive failure", () => {
  const r = reconcileService(
    base({ observedStatus: "critical", failureGate: { consecutiveFailures: 3, threshold: 3 } }),
  );
  assert.equal(r.action.type, "open_incident");
  if (r.action.type === "open_incident") {
    assert.equal(r.action.severity, "critical");
    assert.match(r.action.title, /Application endpoint/);
  }
});

test("a warning below the threshold is held too", () => {
  const r = reconcileService(
    base({ observedStatus: "warning", failureGate: { consecutiveFailures: 1, threshold: 3 } }),
  );
  assert.equal(r.action.type, "below_threshold");
  assert.equal(r.serviceStatus, "warning");
});

test("no gate keeps Phase 1 behaviour: the first bad reading acts", () => {
  assert.equal(reconcileService(base({ observedStatus: "critical" })).action.type, "open_incident");
  assert.equal(
    reconcileService(base({ observedStatus: "critical", failureGate: null })).action.type,
    "open_incident",
  );
});

test("the gate never applies once an incident is open (no duplicate incidents)", () => {
  const r = reconcileService(
    base({
      observedStatus: "critical",
      activeIncident: openIncident,
      failureGate: { consecutiveFailures: 1, threshold: 3 },
    }),
  );
  assert.equal(r.action.type, "record_ongoing");
});

test("the gate does not affect recovery: verification still needs DEFAULT_VERIFICATION_CHECKS", () => {
  const started = reconcileService(
    base({
      observedStatus: "healthy",
      activeIncident: openIncident,
      failureGate: { consecutiveFailures: 0, threshold: 3 },
    }),
  );
  assert.equal(started.action.type, "begin_verification");
  if (started.action.type === "begin_verification") {
    assert.equal(started.action.checksRequired, DEFAULT_VERIFICATION_CHECKS);
  }

  const advanced = reconcileService(
    base({
      observedStatus: "healthy",
      activeIncident: openIncident,
      activeVerification: { id: "v1", status: "running", checksRequired: 3, checksPassed: 1 },
      failureGate: { consecutiveFailures: 0, threshold: 3 },
    }),
  );
  assert.equal(advanced.action.type, "advance_verification");
  if (advanced.action.type === "advance_verification") {
    assert.equal(advanced.action.checksPassed, 2);
  }

  const confirmed = reconcileService(
    base({
      observedStatus: "healthy",
      activeIncident: openIncident,
      activeVerification: { id: "v1", status: "running", checksRequired: 3, checksPassed: 2 },
      failureGate: { consecutiveFailures: 0, threshold: 3 },
    }),
  );
  assert.equal(confirmed.action.type, "confirm_recovery");

  const reset = reconcileService(
    base({
      observedStatus: "critical",
      activeIncident: openIncident,
      activeVerification: { id: "v1", status: "running", checksRequired: 3, checksPassed: 2 },
      failureGate: { consecutiveFailures: 1, threshold: 3 },
    }),
  );
  assert.equal(reset.action.type, "reset_verification");
});

test("healthy readings are never gated", () => {
  const r = reconcileService(
    base({ observedStatus: "healthy", failureGate: { consecutiveFailures: 0, threshold: 3 } }),
  );
  assert.equal(r.action.type, "none");
});