/**
 * Onboarding validation tests — every step validates before Continue,
 * Review validates the whole path. Pure functions, no I/O.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { emptyWizardState, type WizardState } from "../../lib/onboarding/types";
import {
  validateBasics,
  validateRepository,
  validateDeployment,
  validateEnvironment,
  validateRuntime,
  validateHealth,
} from "../../lib/onboarding/validation";

function state(): WizardState {
  return emptyWizardState("draft-test");
}

test("basics requires a name and an environment", () => {
  const e = validateBasics(state());
  assert.ok(e.name, "name required");
  assert.ok(e.environment, "environment required");
});

test("basics accepts a complete identity", () => {
  const s = state();
  s.basics.name = "Payments API";
  s.basics.environment = "Production";
  s.basics.tags = ["api", "payments"];
  assert.deepEqual(validateBasics(s), {});
});

test("basics rejects over-long names and too many tags", () => {
  const s = state();
  s.basics.name = "x".repeat(81);
  s.basics.environment = "Staging";
  s.basics.tags = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  const e = validateBasics(s);
  assert.ok(e.name);
  assert.ok(e.tags);
});

test("repository may be skipped (manual path stays open)", () => {
  assert.deepEqual(validateRepository(state()), {});
});

test("repository rejects a malformed URL but accepts github + hosts", () => {
  const bad = state();
  bad.repository.url = "not a url at all !!!";
  assert.ok(validateRepository(bad).url);

  const good = state();
  good.repository.url = "https://github.com/org/repo";
  assert.deepEqual(validateRepository(good), {});
});

test("deployment requires an explicit choice (including none)", () => {
  assert.ok(validateDeployment(state()).strategy);
  const s = state();
  s.deployment.strategy = "none";
  assert.deepEqual(validateDeployment(s), {});
});

test("environment rejects bad keys and duplicates", () => {
  const s = state();
  s.environment.vars = [{ key: "1BAD", value: "x" }];
  assert.ok(validateEnvironment(s).vars);

  const dup = state();
  dup.environment.vars = [
    { key: "A", value: "1" },
    { key: "A", value: "2" },
  ];
  assert.ok(validateEnvironment(dup).vars);

  const okState = state();
  okState.environment.vars = [{ key: "DATABASE_HOST", value: "db" }];
  okState.environment.secrets = [{ key: "JWT_SECRET", hasValue: false }];
  assert.deepEqual(validateEnvironment(okState), {});
});

test("runtime requires a start command and a sane port", () => {
  const s = state();
  assert.ok(validateRuntime(s).startCommand);
  s.runtime.startCommand = "npm start";
  assert.deepEqual(validateRuntime(s), {});
  s.runtime.port = "99999";
  assert.ok(validateRuntime(s).port);
  s.runtime.port = "3000";
  assert.deepEqual(validateRuntime(s), {});
});

test("health validates endpoint shape and numeric ranges", () => {
  const s = state();
  s.health.endpoint = "no-leading-slash";
  s.health.intervalSec = "5";
  s.health.timeoutSec = "0";
  s.health.failureThreshold = "99";
  const e = validateHealth(s);
  assert.ok(e.endpoint);
  assert.ok(e.intervalSec);
  assert.ok(e.timeoutSec);
  assert.ok(e.failureThreshold);

  const ok = state();
  ok.health.targetUrl = "https://app.example.com";
  ok.health.endpoint = "/api/health";
  assert.deepEqual(validateHealth(ok), {});
});

test("a fresh wizard cannot pass health validation without an endpoint", () => {
  // emptyWizardState no longer pre-fills "/api/health": an endpoint must come
  // from analysis or from the user, so Continue must prompt rather than
  // silently monitoring a guessed path.
  const s = state();
  assert.ok(validateHealth(s).endpoint, "empty endpoint is not valid for HTTP");
  // Switching to a port check needs no endpoint at all.
  s.health.method = "port";
  assert.deepEqual(validateHealth(s), {});
});
