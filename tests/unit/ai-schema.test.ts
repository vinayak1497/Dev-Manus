/**
 * AI output schema-validation tests (acceptance §12/§13/§24).
 *
 * Model output is untrusted. parseIncidentAnalysis is the boundary that either
 * returns a strict IncidentAnalysis or an error the caller turns into a
 * fallback / honest "unavailable" — it must never let malformed or unsafe
 * content (an off-allowlist actionType) through.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseIncidentAnalysis } from "../../lib/ai/schema";

function validAnalysis(): unknown {
  return {
    observation: "api returned elevated 5xx",
    interpretation: "Based only on supplied evidence, error rate rose.",
    confidence: "medium",
    evidence: [
      { source: "metric", timestamp: "2026-01-01T00:00:00Z", statement: "error rate 12%" },
    ],
    suggestedActions: [
      {
        title: "Restart the service",
        description: "Restart demo service",
        risk: "low",
        actionType: "RESTART_DEMO_SERVICE",
      },
    ],
    insufficientEvidence: false,
  };
}

test("a well-formed analysis parses and preserves fields", () => {
  const r = parseIncidentAnalysis(validAnalysis());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.confidence, "medium");
    assert.equal(r.value.evidence.length, 1);
    assert.equal(r.value.suggestedActions[0].actionType, "RESTART_DEMO_SERVICE");
    assert.equal(r.value.insufficientEvidence, false);
  }
});

test("a non-object is rejected", () => {
  assert.equal(parseIncidentAnalysis("nope").ok, false);
  assert.equal(parseIncidentAnalysis(null).ok, false);
  assert.equal(parseIncidentAnalysis(42).ok, false);
});

test("missing required strings are rejected", () => {
  const a = validAnalysis() as Record<string, unknown>;
  delete a.observation;
  const r = parseIncidentAnalysis(a);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /observation/);
});

test("an invalid confidence enum is rejected", () => {
  const a = validAnalysis() as Record<string, unknown>;
  a.confidence = "urgent";
  assert.equal(parseIncidentAnalysis(a).ok, false);
});

test("non-array evidence / actions are rejected", () => {
  const a = validAnalysis() as Record<string, unknown>;
  a.evidence = "not-an-array";
  assert.equal(parseIncidentAnalysis(a).ok, false);
  const b = validAnalysis() as Record<string, unknown>;
  b.suggestedActions = {};
  assert.equal(parseIncidentAnalysis(b).ok, false);
});

test("an evidence row missing its statement is rejected", () => {
  const a = validAnalysis() as Record<string, unknown>;
  a.evidence = [{ source: "metric", timestamp: null }];
  const r = parseIncidentAnalysis(a);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /statement/);
});

test("an invalid action risk is rejected", () => {
  const a = validAnalysis() as Record<string, unknown>;
  a.suggestedActions = [
    { title: "t", description: "d", risk: "catastrophic", actionType: "RESTART_DEMO_SERVICE" },
  ];
  assert.equal(parseIncidentAnalysis(a).ok, false);
});

test("an off-allowlist actionType is rejected (the choke point)", () => {
  const a = validAnalysis() as Record<string, unknown>;
  a.suggestedActions = [
    { title: "pwn", description: "d", risk: "low", actionType: "EXECUTE_ARBITRARY_COMMAND" },
  ];
  const r = parseIncidentAnalysis(a);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /allowlist/i);
});

test("an action with no actionType is allowed (advisory only)", () => {
  const a = validAnalysis() as Record<string, unknown>;
  a.suggestedActions = [{ title: "Investigate logs", description: "d", risk: "low" }];
  const r = parseIncidentAnalysis(a);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.suggestedActions[0].actionType, undefined);
});

test("insufficientEvidence is only true for a literal true", () => {
  const a = validAnalysis() as Record<string, unknown>;
  a.insufficientEvidence = "true";
  const r = parseIncidentAnalysis(a);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.insufficientEvidence, false);
});
