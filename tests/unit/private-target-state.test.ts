/**
 * Private-target read-back states — four honest outcomes, no trust inference.
 *
 * The dashboard cannot see the worker's allowlist. These tests pin the only
 * claims it is allowed to make from persisted rows:
 *
 * - unverified: no matching observation and no error;
 * - checked: a matching healthy observation exists;
 * - refused: the worker's latest error is an SSRF refusal;
 * - failed: the worker ran and recorded a non-healthy result, or another error.
 *
 * In particular, a previous check timestamp alone is NEVER "trusted", and a
 * successful check is reported as "checked", not as proof of current
 * allowlisting.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  derivePrivateTargetState,
  isPrivateTargetRefusal,
} from "../../lib/monitoring/private-target-state";
import type { AutomaticMonitoringView } from "../../lib/monitoring/automatic-state";

const HOST = "172.31.30.138";

function view(
  overrides: Partial<AutomaticMonitoringView> = {},
): AutomaticMonitoringView {
  return {
    configured: true,
    enabled: true,
    serviceId: "service-1",
    lastCheckedAt: null,
    nextCheckAt: null,
    lastStatus: null,
    lastStatusCode: null,
    lastDetail: null,
    lastError: null,
    consecutiveFailures: null,
    failureThreshold: 3,
    intervalSec: 30,
    stale: false,
    ...overrides,
  };
}

test("no automatic view is unverified", () => {
  assert.deepEqual(derivePrivateTargetState(HOST, undefined), {
    kind: "unverified",
    host: HOST,
  });
});

test("a previous check timestamp alone is not evidence of trust", () => {
  const state = derivePrivateTargetState(
    HOST,
    view({ lastCheckedAt: "2026-01-01T00:00:00.000Z", lastStatus: "healthy" }),
  );
  assert.equal(state.kind, "unverified");
});

test("a matching healthy observation is reported as checked", () => {
  const state = derivePrivateTargetState(
    HOST,
    view({
      lastCheckedAt: "2026-01-01T00:00:00.000Z",
      lastStatus: "healthy",
      lastStatusCode: 200,
      lastDetail: "GET http://172.31.30.138/ → HTTP 200 in 5ms. HTTP 200 (expected).",
    }),
  );
  assert.deepEqual(state, {
    kind: "checked",
    host: HOST,
    statusCode: 200,
    detail: "GET http://172.31.30.138/ → HTTP 200 in 5ms. HTTP 200 (expected).",
  });
});

test("a matching non-healthy observation is a failed check", () => {
  const state = derivePrivateTargetState(
    HOST,
    view({
      lastCheckedAt: "2026-01-01T00:00:00.000Z",
      lastStatus: "critical",
      lastDetail: "No HTTP response (connection failed)",
    }),
  );
  assert.equal(state.kind, "failed");
  if (state.kind !== "failed") return;
  assert.equal(state.detail, "No HTTP response (connection failed)");
  assert.equal(state.error, null);
});

test("a worker SSRF refusal is reported as refused", () => {
  const message = `Refusing to check non-public target "${HOST}".`;
  const state = derivePrivateTargetState(HOST, view({ lastError: message }));
  assert.deepEqual(state, { kind: "refused", host: HOST, error: message });
});

test("the trusted-target policy refusal is also refused", () => {
  const message = `Refusing to check "${HOST}" under the trusted-target policy: hostname is not in the trusted allowlist.`;
  const state = derivePrivateTargetState(HOST, view({ lastError: message }));
  assert.equal(state.kind, "refused");
});

test("the internal-target refusal is also refused", () => {
  const message = `Refusing to check internal target "${HOST}".`;
  const state = derivePrivateTargetState(HOST, view({ lastError: message }));
  assert.equal(state.kind, "refused");
});

test("a credential refusal is a failed check, not an allowlist refusal", () => {
  const message = "Refusing to check a target URL with credentials.";
  const state = derivePrivateTargetState(HOST, view({ lastError: message }));
  assert.equal(state.kind, "failed");
  if (state.kind !== "failed") return;
  assert.equal(state.error, message);
});

test("a non-refusal error without a matching observation is failed", () => {
  const state = derivePrivateTargetState(
    HOST,
    view({ lastError: 'Monitoring target "internal.example" does not resolve.' }),
  );
  assert.equal(state.kind, "failed");
  if (state.kind !== "failed") return;
  assert.equal(state.error, 'Monitoring target "internal.example" does not resolve.');
  assert.equal(state.detail, null);
});

test("a refusal is never downgraded by a stale healthy observation", () => {
  const message = `Refusing to check non-public target "${HOST}".`;
  const state = derivePrivateTargetState(
    HOST,
    view({
      lastStatus: "healthy",
      lastStatusCode: 200,
      lastDetail: "HTTP 200 (expected).",
      lastError: message,
    }),
  );
  assert.equal(state.kind, "refused");
});

test("isPrivateTargetRefusal matches only private-target refusals", () => {
  assert.equal(
    isPrivateTargetRefusal(`Refusing to check non-public target "${HOST}".`),
    true,
  );
  assert.equal(
    isPrivateTargetRefusal(`Refusing to check internal target "${HOST}".`),
    true,
  );
  assert.equal(
    isPrivateTargetRefusal(
      `Refusing to check "${HOST}" under the trusted-target policy: hostname is not in the trusted allowlist.`,
    ),
    true,
  );
  assert.equal(
    isPrivateTargetRefusal("Refusing to check a target URL with credentials."),
    false,
  );
  assert.equal(isPrivateTargetRefusal(null), false);
  assert.equal(isPrivateTargetRefusal(undefined), false);
});
