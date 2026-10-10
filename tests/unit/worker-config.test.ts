/**
 * Worker startup configuration + structured logging.
 *
 * A monitoring worker that starts half-configured is worse than one that
 * refuses to start: it looks alive and monitors nothing. These tests pin the
 * startup contract, and pin that the logger can never print a credential.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  describeWorkerConfig,
  loadWorkerConfig,
  type WorkerEnvironment,
} from "../../lib/monitoring/worker-config";
import { createWorkerLogger } from "../../lib/monitoring/worker-log";
import { retryDelaySeconds } from "../../lib/monitoring/scheduler";

const GOOD: WorkerEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

test("a fully configured environment starts", () => {
  const result = loadWorkerConfig(GOOD, { workerId: "worker-test" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.config.workerId, "worker-test");
  assert.equal(result.config.pollSeconds, 10);
  assert.equal(result.config.concurrency, 4);
  assert.equal(result.config.batchLimit, 200);
  assert.equal(result.config.leaseSeconds, 120);
  assert.equal(result.config.enabled, true);
  assert.equal(result.config.once, false);
  assert.equal(result.config.projectId, null);
});

test("a missing service-role credential is a startup error", () => {
  const result = loadWorkerConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://p.supabase.co" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /SUPABASE_SERVICE_ROLE_KEY/);
});

test("SUPABASE_SECRET_KEY is accepted as the newer server-only key", () => {
  const result = loadWorkerConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://p.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_x",
  });
  assert.equal(result.ok, true);
});

test("a missing or malformed Supabase URL is a startup error", () => {
  assert.equal(loadWorkerConfig({ SUPABASE_SERVICE_ROLE_KEY: "k" }).ok, false);
  assert.equal(
    loadWorkerConfig({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url", SUPABASE_SERVICE_ROLE_KEY: "k" }).ok,
    false,
  );
});

test("a service-role key exposed as NEXT_PUBLIC_* is rejected outright", () => {
  const result = loadWorkerConfig({
    ...GOOD,
    NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "leaked",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join(" "), /NEXT_PUBLIC/);
});

test("out-of-range tuning values are rejected rather than silently clamped", () => {
  const result = loadWorkerConfig({
    ...GOOD,
    MONITOR_WORKER_CONCURRENCY: "99",
    MONITOR_WORKER_POLL_SECONDS: "0",
    MONITOR_WORKER_BATCH_LIMIT: "abc",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join(" "), /MONITOR_WORKER_CONCURRENCY/);
  assert.match(result.errors.join(" "), /MONITOR_WORKER_POLL_SECONDS/);
  assert.match(result.errors.join(" "), /MONITOR_WORKER_BATCH_LIMIT/);
});

test("a poll interval longer than the smallest service interval warns", () => {
  const result = loadWorkerConfig({ ...GOOD, MONITOR_WORKER_POLL_SECONDS: "120" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /MONITOR_WORKER_POLL_SECONDS/);
});

test("automatic monitoring can be switched off without breaking startup", () => {
  const result = loadWorkerConfig({ ...GOOD, MONITOR_WORKER_ENABLED: "false" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.config.enabled, false);
});

test("the startup log line never contains the credential", () => {
  const result = loadWorkerConfig(GOOD, { workerId: "worker-test" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const described = JSON.stringify(describeWorkerConfig(result.config));
  assert.ok(!described.includes("test-service-role-key"));
  assert.ok(described.includes("worker-test"));
});

test("the logger writes one JSON object per line and honours its level", () => {
  const lines: string[] = [];
  const errors: string[] = [];
  const log = createWorkerLogger({
    level: "info",
    write: (line) => lines.push(line),
    writeError: (line) => errors.push(line),
  });
  log.debug("skipped");
  log.info("hello", { projectId: "p1" });
  log.warn("careful", { projectId: "p1" });
  log.error("broken");

  assert.equal(lines.length, 1, "debug is below the threshold");
  assert.equal(errors.length, 2);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.msg, "hello");
  assert.equal(parsed.level, "info");
  assert.equal(parsed.projectId, "p1");
  assert.ok(typeof parsed.ts === "string");
});

test("credential-shaped fields are redacted before anything is written", () => {
  const lines: string[] = [];
  const log = createWorkerLogger({ level: "debug", write: (line) => lines.push(line) });
  log.info("cfg", {
    supabaseServiceRoleKey: "super-secret-value",
    token: "t-o-k-e-n",
    password: "hunter2",
    authorization: "Bearer abc",
    nested: { apiKey: "still-secret" },
    list: [{ secretKey: "list-secret" }],
    safe: "kept",
  });
  const out = lines[0];
  for (const secret of [
    "super-secret-value",
    "t-o-k-e-n",
    "hunter2",
    "Bearer abc",
    "still-secret",
    "list-secret",
  ]) {
    assert.ok(!out.includes(secret), `log leaked ${secret}`);
  }
  assert.match(out, /\[redacted\]/);
  assert.match(out, /kept/);
});

test("an Error is logged as name + message, never its stack or cause", () => {
  const lines: string[] = [];
  const errors: string[] = [];
  const log = createWorkerLogger({
    level: "debug",
    write: (line) => lines.push(line),
    writeError: (line) => errors.push(line),
  });
  const error = new TypeError("boom");
  (error as unknown as { cause: string }).cause = "SECRET_CAUSE";
  log.error("failed", { error });
  assert.equal(lines.length, 0, "errors go to stderr, never stdout");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /boom/);
  assert.ok(!errors[0].includes("SECRET_CAUSE"));
  assert.ok(!errors[0].includes("at "));
});

test("retry pacing is bounded and grows, never tight-loops", () => {
  // A configuration problem that cannot fix itself: slow, capped retries.
  assert.equal(retryDelaySeconds("configuration", 30, 0), 300);
  assert.equal(retryDelaySeconds("configuration", 30, 9), 300);
  // A transient problem: exponential, floored, capped.
  assert.equal(retryDelaySeconds("transient", 30, 0), 30);
  assert.equal(retryDelaySeconds("transient", 30, 1), 60);
  assert.equal(retryDelaySeconds("transient", 30, 2), 120);
  assert.equal(retryDelaySeconds("transient", 30, 50), 600);
  // A very short configured interval must still be floored, not hammered.
  assert.equal(retryDelaySeconds("transient", 10, 0), 30);
  // A very long configured interval is still capped, so one dead target cannot
  // hold a worker's attention for an hour.
  assert.equal(retryDelaySeconds("transient", 3600, 0), 600);
});