/**
 * Runtime reading of the stored health configuration.
 *
 * These are the numbers the unattended scheduler acts on. They must never
 * disagree with the wizard's validation rules, so the bounds themselves are
 * asserted here against `lib/onboarding/validation.ts` — the shared source of
 * truth — rather than being restated.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_INTERVAL_SEC,
  DEFAULT_TIMEOUT_SEC,
  hasRunnableHttpConfig,
  isHttpMethod,
  readExpectedStatus,
  readFailureThreshold,
  readIntervalSec,
  readTimeoutSec,
} from "../../lib/monitoring/health-settings";
import { isMonitoringStale } from "../../lib/monitoring/automatic-state";
import {
  HEALTH_FAILURE_THRESHOLD_MAX,
  HEALTH_FAILURE_THRESHOLD_MIN,
  HEALTH_INTERVAL_MAX_SEC,
  HEALTH_INTERVAL_MIN_SEC,
  HEALTH_TIMEOUT_MAX_SEC,
  HEALTH_TIMEOUT_MIN_SEC,
} from "../../lib/onboarding/validation";
import type { StoredHealth } from "../../lib/onboarding/stored-config";

function health(overrides: Partial<StoredHealth> = {}): StoredHealth {
  return {
    method: "http",
    targetType: "external_url",
    targetUrl: "https://app.example.com",
    endpoint: "/healthz",
    expectedStatus: "200",
    intervalSec: "30",
    timeoutSec: "5",
    failureThreshold: "3",
    ...overrides,
  };
}

test("the runtime bounds are exactly the wizard's bounds", () => {
  assert.equal(HEALTH_INTERVAL_MIN_SEC, 10);
  assert.equal(HEALTH_INTERVAL_MAX_SEC, 3600);
  assert.equal(HEALTH_TIMEOUT_MIN_SEC, 1);
  assert.equal(HEALTH_TIMEOUT_MAX_SEC, 120);
  assert.equal(HEALTH_FAILURE_THRESHOLD_MIN, 1);
  assert.equal(HEALTH_FAILURE_THRESHOLD_MAX, 10);
});

test("a valid stored interval is read verbatim", () => {
  assert.equal(readIntervalSec(health({ intervalSec: "45" })), 45);
  assert.equal(readIntervalSec(health({ intervalSec: `${HEALTH_INTERVAL_MIN_SEC}` })), 10);
  assert.equal(readIntervalSec(health({ intervalSec: `${HEALTH_INTERVAL_MAX_SEC}` })), 3600);
});

test("an out-of-range or unusable interval falls back to the documented default", () => {
  assert.equal(readIntervalSec(health({ intervalSec: "0" })), DEFAULT_INTERVAL_SEC);
  assert.equal(readIntervalSec(health({ intervalSec: "5" })), DEFAULT_INTERVAL_SEC);
  assert.equal(readIntervalSec(health({ intervalSec: "100000" })), DEFAULT_INTERVAL_SEC);
  assert.equal(readIntervalSec(health({ intervalSec: "abc" })), DEFAULT_INTERVAL_SEC);
  assert.equal(readIntervalSec(health({ intervalSec: "12.5" })), DEFAULT_INTERVAL_SEC);
  assert.equal(readIntervalSec(health({ intervalSec: null })), DEFAULT_INTERVAL_SEC);
  assert.equal(readIntervalSec(null), DEFAULT_INTERVAL_SEC);
});

test("timeout and threshold are read the same bounded way", () => {
  assert.equal(readTimeoutSec(health({ timeoutSec: "17" })), 17);
  assert.equal(readTimeoutSec(health({ timeoutSec: "0" })), DEFAULT_TIMEOUT_SEC);
  assert.equal(readTimeoutSec(health({ timeoutSec: "121" })), DEFAULT_TIMEOUT_SEC);
  assert.equal(readFailureThreshold(health({ failureThreshold: "1" })), 1);
  assert.equal(readFailureThreshold(health({ failureThreshold: "10" })), 10);
  assert.equal(readFailureThreshold(health({ failureThreshold: "0" })), DEFAULT_FAILURE_THRESHOLD);
  assert.equal(readFailureThreshold(health({ failureThreshold: "11" })), DEFAULT_FAILURE_THRESHOLD);
  assert.equal(readFailureThreshold(null), DEFAULT_FAILURE_THRESHOLD);
});

test("expected status accepts any real HTTP status and rejects nonsense", () => {
  assert.equal(readExpectedStatus(health({ expectedStatus: "200" })), 200);
  assert.equal(readExpectedStatus(health({ expectedStatus: "204" })), 204);
  assert.equal(readExpectedStatus(health({ expectedStatus: "99" })), null);
  assert.equal(readExpectedStatus(health({ expectedStatus: "600" })), null);
  assert.equal(readExpectedStatus(health({ expectedStatus: "ok" })), null);
  assert.equal(readExpectedStatus(health({ expectedStatus: null })), null);
});

test("only an http method is runnable by the HTTP checker", () => {
  assert.equal(isHttpMethod(health()), true);
  assert.equal(isHttpMethod(health({ method: "port" })), false);
  assert.equal(isHttpMethod(health({ method: null })), false);
  assert.equal(isHttpMethod(null), false);
});

test("a runnable configuration needs a method, a target and an endpoint", () => {
  assert.equal(hasRunnableHttpConfig(health()), true);
  assert.equal(hasRunnableHttpConfig(health({ targetUrl: null })), false);
  assert.equal(hasRunnableHttpConfig(health({ endpoint: null })), false);
  assert.equal(hasRunnableHttpConfig(health({ method: "container" })), false);
  assert.equal(hasRunnableHttpConfig(null), false);
});

test("'monitoring has stopped' is only claimed from a real overdue schedule", () => {
  const now = Date.parse("2026-10-10T12:00:00.000Z");
  // Never checked: no claim is made in either direction.
  assert.equal(isMonitoringStale(null, 10, now), false);
  // Due in the future.
  assert.equal(isMonitoringStale("2026-10-10T12:00:05.000Z", 10, now), false);
  // Slightly overdue, inside the grace period.
  assert.equal(isMonitoringStale("2026-10-10T11:59:50.000Z", 10, now), false);
  // Clearly overdue.
  assert.equal(isMonitoringStale("2026-10-10T11:50:00.000Z", 10, now), true);
  // A short interval still gets at least a minute of grace.
  assert.equal(isMonitoringStale("2026-10-10T11:59:30.000Z", 10, now), false);
  // Garbage in, no claim out.
  assert.equal(isMonitoringStale("not-a-date", 10, now), false);
});