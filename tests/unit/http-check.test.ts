/**
 * Configured HTTP check regression tests — the pure classification core.
 *
 * A check result must never be softened: an expected status is healthy, a
 * 5xx is critical, anything else unexpected is a warning, and no answer at
 * all is critical information rather than "unknown".
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyHttpStatus,
  classifyNoResponse,
  isBlockedAddress,
  isBlockedHostname,
} from "../../lib/monitoring/http-check";

test("an expected status is healthy", () => {
  assert.deepEqual(classifyHttpStatus(200, 200), {
    status: "healthy",
    errorRate: 0,
    detail: "HTTP 200 (expected)",
  });
});

test("a 5xx is critical", () => {
  const c = classifyHttpStatus(500, 200);
  assert.equal(c.status, "critical");
  assert.equal(c.errorRate, 1);
});

test("an unexpected redirect or client error is a warning, not critical", () => {
  assert.equal(classifyHttpStatus(301, 200).status, "warning");
  assert.equal(classifyHttpStatus(404, 200).status, "warning");
  assert.equal(classifyHttpStatus(201, 200).status, "warning");
});

test("no response is critical information, never unknown", () => {
  assert.equal(classifyNoResponse("timeout").status, "critical");
  assert.equal(classifyNoResponse("network").status, "critical");
});

test("internal hostnames are blocked without DNS", () => {
  assert.equal(isBlockedHostname("localhost"), true);
  assert.equal(isBlockedHostname("app.local"), true);
  assert.equal(isBlockedHostname("db.internal"), true);
  assert.equal(isBlockedHostname("svc.svc.cluster.local"), true);
  assert.equal(isBlockedHostname("metadata.google.internal"), true);
  assert.equal(isBlockedHostname("app.example.com"), false);
});

test("non-public addresses are blocked", () => {
  assert.equal(isBlockedAddress("127.0.0.1"), true);
  assert.equal(isBlockedAddress("10.1.2.3"), true);
  assert.equal(isBlockedAddress("192.168.1.1"), true);
  assert.equal(isBlockedAddress("169.254.169.254"), true);
  assert.equal(isBlockedAddress("::1"), true);
  assert.equal(isBlockedAddress("93.184.216.34"), false);
});
