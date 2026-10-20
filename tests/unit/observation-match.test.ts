/**
 * "Is this observation evidence about the configuration saved NOW?"
 *
 * The canonical monitored service keeps its history across an endpoint change.
 * Without this predicate, the dashboard rendered the previous endpoint's
 * `HTTP 200` as the "Latest HTTP result" for a target that had never been
 * checked — exactly the stale claim Phase 3 forbids.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationMatchesHealth } from "../../lib/monitoring/observation-match";
import type { StoredHealth } from "../../lib/onboarding/stored-config";

const HEALTH: StoredHealth = {
  method: "http",
  targetType: "external_url",
  targetUrl: "http://172.31.30.138/",
  endpoint: "/",
  expectedStatus: "200",
  intervalSec: "30",
  timeoutSec: "10",
  failureThreshold: "3",
};

const MATCHING = {
  checked_url: "http://172.31.30.138/",
  expected_status: 200,
};

test("a result for the current URL and expectation is evidence", () => {
  assert.equal(observationMatchesHealth(MATCHING, HEALTH), true);
});

test("a result for the previous endpoint is not evidence", () => {
  assert.equal(
    observationMatchesHealth({ ...MATCHING, checked_url: "http://172.31.30.138/status/500" }, HEALTH),
    false,
  );
});

test("a result judged against a different expected status is not evidence", () => {
  assert.equal(
    observationMatchesHealth({ ...MATCHING, expected_status: 204 }, HEALTH),
    false,
  );
});

test("missing or malformed metadata never counts as evidence", () => {
  assert.equal(observationMatchesHealth(null, HEALTH), false);
  assert.equal(observationMatchesHealth({}, HEALTH), false);
  assert.equal(observationMatchesHealth({ checked_url: MATCHING.checked_url }, HEALTH), false);
  assert.equal(observationMatchesHealth({ checked_url: 42, expected_status: 200 }, HEALTH), false);
  assert.equal(
    observationMatchesHealth({ checked_url: MATCHING.checked_url, expected_status: "200" }, HEALTH),
    false,
  );
});

test("a non-HTTP or incomplete configuration has nothing to match", () => {
  assert.equal(observationMatchesHealth(MATCHING, null), false);
  assert.equal(observationMatchesHealth(MATCHING, { ...HEALTH, method: "port" }), false);
  assert.equal(observationMatchesHealth(MATCHING, { ...HEALTH, endpoint: null }), false);
});

test("the endpoint change is what invalidates the old result", () => {
  // Same service row, same URL shape — only the path moved to the failing one.
  const next: StoredHealth = { ...HEALTH, endpoint: "/status/500" };
  assert.equal(observationMatchesHealth(MATCHING, next), false);
  assert.equal(
    observationMatchesHealth(
      { checked_url: "http://172.31.30.138/status/500", expected_status: 200 },
      next,
    ),
    true,
  );
});
