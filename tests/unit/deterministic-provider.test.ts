/**
 * Deterministic AI provider tests (acceptance §13/§24/§25).
 *
 * The deterministic provider is the honest no-key fallback and the E2E test
 * provider. These prove it (a) cites only supplied evidence, (b) declines with
 * insufficientEvidence rather than inventing a cause, and (c) hedges
 * correlation vs causation — the anti-hallucination contract, checked without
 * any network.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { DeterministicProvider } from "../../lib/ai/providers/deterministic";
import type { IncidentAnalysisInput } from "../../lib/ai/types";

const DETECTED_AT = "2026-01-01T12:00:00.000Z";

function input(overrides: Partial<IncidentAnalysisInput> = {}): IncidentAnalysisInput {
  return {
    incident: {
      title: "api degraded",
      severity: "critical",
      status: "open",
      detectedAt: DETECTED_AT,
      serviceName: "api",
      environment: "production",
    },
    evidence: [],
    timeline: [],
    healthChecks: [],
    deployment: null,
    serviceState: { name: "api", status: "critical" },
    ...overrides,
  };
}

const provider = new DeterministicProvider();

test("declines honestly when there is no evidence at all (§13)", async () => {
  const a = await provider.analyzeIncident(input());
  assert.equal(a.insufficientEvidence, true);
  assert.equal(a.confidence, "low");
  assert.equal(a.evidence.length, 0);
  assert.ok(a.suggestedActions.some((s) => s.actionType === "RETRY_HEALTH_CHECK"));
  assert.match(a.interpretation, /[Ii]nsufficient/);
});

test("cites every supplied evidence row verbatim, inventing nothing", async () => {
  const a = await provider.analyzeIncident(
    input({
      evidence: [
        { source: "log", label: "error spike", detail: "500s rising", observedAt: DETECTED_AT },
      ],
      healthChecks: [
        { status: "critical", latencyMs: 900, errorRate: 0.42, checkedAt: DETECTED_AT },
      ],
    }),
  );
  assert.equal(a.insufficientEvidence, false);
  // The supplied log row is echoed as "label: detail".
  assert.ok(a.evidence.some((e) => e.statement === "error spike: 500s rising"));
  // The failing health check is cited with its real numbers, not invented ones.
  assert.ok(a.evidence.some((e) => /error rate 42\.0%/.test(e.statement)));
  assert.ok(a.evidence.some((e) => /latency 900ms/.test(e.statement)));
});

test("hedges correlation vs causation for a deployment before detection", async () => {
  const a = await provider.analyzeIncident(
    input({
      deployment: {
        version: "v2.3.1",
        commit: "abc1234",
        status: "success",
        deployedAt: "2026-01-01T11:58:00.000Z", // 2 min before detection
      },
      healthChecks: [
        { status: "critical", latencyMs: null, errorRate: null, checkedAt: DETECTED_AT },
      ],
    }),
  );
  assert.ok(a.evidence.some((e) => /occurred shortly before/.test(e.statement)));
  assert.match(a.interpretation, /not proof of causation/i);
  // Rollback is offered first when a deployment correlates.
  assert.equal(a.suggestedActions[0].actionType, "ROLLBACK_DEMO_DEPLOYMENT");
});

test("a deployment AFTER detection is not treated as a candidate cause", async () => {
  const a = await provider.analyzeIncident(
    input({
      deployment: {
        version: "v9",
        commit: null,
        status: "success",
        deployedAt: "2026-01-01T12:05:00.000Z", // after detection
      },
      healthChecks: [
        { status: "critical", latencyMs: null, errorRate: null, checkedAt: DETECTED_AT },
      ],
    }),
  );
  assert.ok(!a.evidence.some((e) => /occurred shortly before/.test(e.statement)));
  assert.ok(a.suggestedActions[0].actionType !== "ROLLBACK_DEMO_DEPLOYMENT");
});

test("confidence rises with independent corroborating signals", async () => {
  const a = await provider.analyzeIncident(
    input({
      evidence: [
        { source: "metric", label: "cpu", detail: "98%", observedAt: DETECTED_AT },
        { source: "log", label: "oom", detail: "killed", observedAt: DETECTED_AT },
      ],
      healthChecks: [
        { status: "critical", latencyMs: 1200, errorRate: 0.5, checkedAt: DETECTED_AT },
      ],
      deployment: {
        version: "v2",
        commit: "d34db33",
        status: "success",
        deployedAt: "2026-01-01T11:59:00.000Z",
      },
    }),
  );
  // failing check + deployment correlation + metric + log = 4 signals -> high.
  assert.equal(a.confidence, "high");
});
