/**
 * Detection reconcile-core tests (acceptance §24: creation, dedup, state
 * transitions, recovery detection, verification fail/success).
 *
 * reconcileService is pure, so these assert the exact OBSERVE -> DETECT rules
 * without any database — the same rules the live monitor tick applies.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileService,
  severityForStatus,
  isUnhealthyStatus,
  isHealthyStatus,
  DEFAULT_VERIFICATION_CHECKS,
  type ReconcileInput,
} from "../../lib/detection/reconcile";

function base(overrides: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    service: { id: "s1", name: "api", currentStatus: "healthy" },
    observedStatus: "healthy",
    activeIncident: null,
    activeVerification: null,
    ...overrides,
  };
}

const activeIncident = {
  id: "inc1",
  status: "open" as const,
  severity: "critical" as const,
};

test("opens a critical incident on a critical reading when none is active", () => {
  const r = reconcileService(
    base({ observedStatus: "critical", activeIncident: null }),
  );
  assert.equal(r.action.type, "open_incident");
  assert.equal(r.serviceStatus, "critical");
  if (r.action.type === "open_incident") {
    assert.equal(r.action.severity, "critical");
    assert.match(r.action.title, /api/);
  }
});

test("a warning reading opens a medium-severity incident", () => {
  const r = reconcileService(base({ observedStatus: "warning" }));
  assert.equal(r.action.type, "open_incident");
  if (r.action.type === "open_incident") {
    assert.equal(r.action.severity, "medium");
  }
});

test("healthy with no active incident is a no-op", () => {
  const r = reconcileService(base({ observedStatus: "healthy" }));
  assert.equal(r.action.type, "none");
});

test("deduplicates: still-unhealthy with an active incident records ongoing", () => {
  const r = reconcileService(
    base({ observedStatus: "critical", activeIncident }),
  );
  // Crucially NOT open_incident — the single active incident is reused (§9).
  assert.equal(r.action.type, "record_ongoing");
});

test("recovery begins verification, it does not resolve immediately", () => {
  const r = reconcileService(
    base({
      observedStatus: "healthy",
      activeIncident,
      activeVerification: null,
    }),
  );
  assert.equal(r.action.type, "begin_verification");
  assert.equal(r.serviceStatus, "recovering");
  if (r.action.type === "begin_verification") {
    assert.equal(r.action.checksRequired, DEFAULT_VERIFICATION_CHECKS);
  }
});

test("a healthy check advances verification but does not confirm early", () => {
  const r = reconcileService(
    base({
      observedStatus: "healthy",
      activeIncident,
      activeVerification: {
        id: "v1",
        status: "running",
        checksRequired: 3,
        checksPassed: 1,
      },
    }),
  );
  assert.equal(r.action.type, "advance_verification");
  assert.equal(r.serviceStatus, "recovering");
  if (r.action.type === "advance_verification") {
    assert.equal(r.action.checksPassed, 2);
  }
});

test("recovery is confirmed only after the required consecutive checks", () => {
  const r = reconcileService(
    base({
      observedStatus: "healthy",
      activeIncident,
      activeVerification: {
        id: "v1",
        status: "running",
        checksRequired: 3,
        checksPassed: 2,
      },
    }),
  );
  assert.equal(r.action.type, "confirm_recovery");
  assert.equal(r.serviceStatus, "healthy");
});

test("an unhealthy reading mid-verification resets progress (never resolves)", () => {
  const r = reconcileService(
    base({
      observedStatus: "critical",
      activeIncident,
      activeVerification: {
        id: "v1",
        status: "running",
        checksRequired: 3,
        checksPassed: 2,
      },
    }),
  );
  assert.equal(r.action.type, "reset_verification");
  assert.notEqual(r.action.type, "confirm_recovery");
});

test("an ambiguous reading during verification holds (no advance, no reset)", () => {
  const r = reconcileService(
    base({
      observedStatus: "unknown",
      activeIncident,
      activeVerification: {
        id: "v1",
        status: "running",
        checksRequired: 3,
        checksPassed: 1,
      },
    }),
  );
  assert.equal(r.action.type, "none");
});

test("severity + status helpers map as documented", () => {
  assert.equal(severityForStatus("critical"), "critical");
  assert.equal(severityForStatus("warning"), "medium");
  assert.equal(severityForStatus("healthy"), "low");
  assert.equal(isUnhealthyStatus("critical"), true);
  assert.equal(isUnhealthyStatus("warning"), true);
  assert.equal(isUnhealthyStatus("healthy"), false);
  assert.equal(isHealthyStatus("healthy"), true);
  assert.equal(isHealthyStatus("recovering"), false);
});
