/**
 * Editable health monitoring — the save path.
 *
 * The dashboard displayed what onboarding stored but had no way to change it,
 * so a mistyped endpoint could only be fixed by re-running the wizard. These
 * tests pin the properties that make the new editor safe:
 *
 *   - onboarding's validators are the only rule set (no second rule);
 *   - a save writes ONLY the health block (plus the honest pending status),
 *     preserving unrelated columns and unknown health keys;
 *   - authorization fails closed (no session, no project access, RLS no-op);
 *   - a failed write is never reported as a save;
 *   - saving never manufactures a health observation;
 *   - a changed target does not keep presenting the previous target's result;
 *   - a cadence-only edit does not throw away a still-valid observation.
 *
 * No database is touched: every case runs against the injected backend.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  healthProbeIdentity,
  mergeHealthSettings,
  saveHealthConfigurationCore,
  validateHealthSettings,
  type HealthEditBackend,
  type HealthSettingsInput,
} from "../../lib/monitoring/health-edit";
import { normalizeStoredHealth } from "../../lib/onboarding/stored-config";
import type { Json } from "../../lib/supabase/database.types";

const INPUT: HealthSettingsInput = {
  method: "http",
  targetType: "external_url",
  targetUrl: "http://172.31.30.138/",
  endpoint: "/",
  expectedStatus: "200",
  intervalSec: "30",
  timeoutSec: "10",
  failureThreshold: "3",
};

const STORED = {
  method: "http",
  targetType: "external_url",
  targetUrl: "http://172.31.30.138/",
  endpoint: "/",
  expectedStatus: "200",
  intervalSec: "30",
  timeoutSec: "10",
  failureThreshold: "3",
  methodProvenance: "detected",
  targetProvenance: "detected",
  endpointProvenance: "detected",
};

type Patch = { health: Record<string, unknown>; monitoring_status?: "pending" };

function makeBackend(overrides: Partial<{
  userId: string | null;
  projectVisible: boolean;
  config: { health: unknown; monitoringStatus: unknown } | null;
  configError: string | null;
  updateError: string | null;
  updateMatches: boolean;
  resetError: { message: string; code?: string; schemaMissing?: boolean } | null;
  serviceStatuses: (string | null)[];
  statusesError: string | null;
  projectHealthError: string | null;
}> = {}) {
  const state = {
    userId: "user-1" as string | null,
    projectVisible: true,
    config: { health: { ...STORED }, monitoringStatus: "active" } as {
      health: unknown;
      monitoringStatus: unknown;
    } | null,
    configError: null as string | null,
    updateError: null as string | null,
    updateMatches: true,
    resetError: null as { message: string; code?: string; schemaMissing?: boolean } | null,
    serviceStatuses: ["healthy", null] as (string | null)[],
    statusesError: null as string | null,
    projectHealthError: null as string | null,
    calls: [] as string[],
    patches: [] as Patch[],
    resetUrls: [] as (string | null)[],
    projectHealth: "healthy" as string | null,
    /** The save path must never write evidence. */
    observedChecks: 0,
    ...overrides,
  };

  const backend: HealthEditBackend = {
    async currentUserId() {
      state.calls.push("currentUserId");
      return state.userId;
    },
    async findProject() {
      state.calls.push("findProject");
      return state.projectVisible;
    },
    async readConfig() {
      state.calls.push("readConfig");
      if (state.configError) {
        return { ok: false, error: { message: state.configError } };
      }
      return { ok: true, row: state.config };
    },
    async updateConfig(_projectId, patch) {
      state.calls.push("updateConfig");
      state.patches.push(patch);
      if (state.updateError) {
        return { ok: false, error: { message: state.updateError } };
      }
      if (state.updateMatches && state.config) {
        state.config = {
          health: patch.health,
          monitoringStatus: patch.monitoring_status ?? state.config.monitoringStatus,
        };
      }
      return { ok: true, updated: state.updateMatches };
    },
    async resetMonitoredService(_projectId, checkedUrl) {
      state.calls.push("resetMonitoredService");
      state.resetUrls.push(checkedUrl);
      if (state.resetError) {
        return {
          ok: false,
          error: state.resetError,
          schemaMissing: state.resetError.schemaMissing,
        };
      }
      return { ok: true, reset: 1 };
    },
    async readServiceStatuses() {
      state.calls.push("readServiceStatuses");
      if (state.statusesError) {
        return { ok: false, error: { message: state.statusesError } };
      }
      return { ok: true, statuses: state.serviceStatuses };
    },
    async updateProjectHealth(_projectId, health) {
      state.calls.push("updateProjectHealth");
      if (state.projectHealthError) {
        return { ok: false, error: { message: state.projectHealthError } };
      }
      state.projectHealth = health;
      return { ok: true };
    },
  };

  return { backend, state };
}

function readBack(state: { config: { health: unknown } | null }) {
  return normalizeStoredHealth(state.config?.health as Json);
}

// ---------------------------------------------------------------------------
// Validation — the same rules onboarding uses
// ---------------------------------------------------------------------------

test("accepts a valid HTTP configuration and normalizes the endpoint", () => {
  const result = validateHealthSettings({ ...INPUT, endpoint: "/status/500" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.endpoint, "/status/500");
  assert.equal(result.value.targetUrl, "http://172.31.30.138/");
  assert.equal(result.value.expectedStatus, "200");
  assert.equal(result.value.intervalSec, "30");
});

test("rejects target URLs onboarding rejects, including credentials", () => {
  for (const targetUrl of [
    "not-a-url",
    "ftp://example.com",
    "http://user:secret@example.com",
    "",
  ]) {
    const result = validateHealthSettings({ ...INPUT, targetUrl });
    assert.equal(result.ok, false, `expected ${JSON.stringify(targetUrl)} to fail`);
    if (result.ok) continue;
    assert.ok(result.fieldErrors.targetUrl, `expected a targetUrl error for ${targetUrl}`);
  }
});

test("rejects an endpoint path that is not a path", () => {
  for (const endpoint of ["health", "https://example.com/health", "/a b"]) {
    const result = validateHealthSettings({ ...INPUT, endpoint });
    assert.equal(result.ok, false, `expected ${JSON.stringify(endpoint)} to fail`);
    if (result.ok) continue;
    assert.ok(result.fieldErrors.endpoint, `expected an endpoint error for ${endpoint}`);
  }
});

test("rejects an unexpected status, interval, timeout and threshold", () => {
  const cases: [keyof HealthSettingsInput, string][] = [
    ["expectedStatus", "500"],
    ["intervalSec", "9"],
    ["intervalSec", "3601"],
    ["intervalSec", "30.5"],
    ["timeoutSec", "0"],
    ["timeoutSec", "121"],
    ["failureThreshold", "0"],
    ["failureThreshold", "11"],
    ["failureThreshold", "two"],
  ];
  for (const [field, value] of cases) {
    const result = validateHealthSettings({ ...INPUT, [field]: value });
    assert.equal(result.ok, false, `expected ${field}=${value} to fail`);
    if (result.ok) continue;
    assert.ok(result.fieldErrors[field], `expected a ${field} error for ${value}`);
  }
});

test("rejects an unknown method or target type", () => {
  const method = validateHealthSettings({ ...INPUT, method: "tcp" });
  assert.equal(method.ok, false);
  if (!method.ok) assert.ok(method.fieldErrors.method);

  const type = validateHealthSettings({ ...INPUT, targetType: "magic" });
  assert.equal(type.ok, false);
  if (!type.ok) assert.ok(type.fieldErrors.targetType);
});

test("a non-HTTP method leaves the inert URL fields alone", () => {
  const result = validateHealthSettings({ ...INPUT, method: "port" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.method, "port");
  assert.equal(result.value.targetUrl, undefined);
  assert.equal(result.value.endpoint, undefined);
  assert.equal(result.value.expectedStatus, undefined);

  const merged = mergeHealthSettings(
    { ...STORED, endpoint: "/kept" },
    result.value,
  );
  assert.equal(merged.endpoint, "/kept", "hidden fields must not be overwritten");
  assert.equal(merged.method, "port");
});

// ---------------------------------------------------------------------------
// Probe identity — what invalidates the last observation
// ---------------------------------------------------------------------------

test("URL formatting that resolves to the same check URL is not a change", () => {
  const a = healthProbeIdentity({ method: "http", targetUrl: "http://x.test", endpoint: "/" });
  const b = healthProbeIdentity({ method: "http", targetUrl: "http://x.test/", endpoint: "/" });
  assert.equal(a, b);
});

test("endpoint, target and expected status are identity; cadence is not", () => {
  const base = { method: "http", targetUrl: "http://x.test", endpoint: "/", expectedStatus: "200" };
  const baseId = healthProbeIdentity(base);

  assert.notEqual(healthProbeIdentity({ ...base, endpoint: "/status/500" }), baseId);
  assert.notEqual(healthProbeIdentity({ ...base, targetUrl: "http://y.test" }), baseId);
  assert.notEqual(healthProbeIdentity({ ...base, expectedStatus: "204" }), baseId);

  assert.equal(
    healthProbeIdentity({ ...base, intervalSec: "300", timeoutSec: "60", failureThreshold: "9" }),
    baseId,
  );
});

// ---------------------------------------------------------------------------
// Persistence core
// ---------------------------------------------------------------------------

test("saves a new endpoint, marks it unchecked and never fabricates a result", async () => {
  const { backend, state } = makeBackend();
  const result = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });

  assert.equal(result.ok, true);
  assert.match(result.message ?? "", /has not been checked yet/);
  assert.equal(state.patches.length, 1);

  const patch = state.patches[0];
  assert.equal(patch.health.endpoint, "/status/500");
  assert.equal(patch.health.targetUrl, "http://172.31.30.138/");
  assert.equal(patch.monitoring_status, "pending");

  // The previous target's scheduling state is cleared, so the dashboard shows
  // "no check has run yet" rather than the old target's healthy result. The
  // service label is re-pointed at the new URL too.
  assert.ok(state.calls.includes("resetMonitoredService"));
  assert.deepEqual(state.resetUrls, ["http://172.31.30.138/status/500"]);
  assert.equal(state.observedChecks, 0, "saving must not write an observation");

  // Read-back proves the saved value, and the pending status makes the UI say
  // "first check pending" rather than "healthy".
  const stored = readBack(state);
  assert.equal(stored?.endpoint, "/status/500");
  assert.equal(state.config?.monitoringStatus, "pending");
});

test("preserves unrelated configuration and unknown health keys", async () => {
  const richHealth = {
    ...STORED,
    notes: "kept for audit",
    tags: ["edge", "prod"],
    targetTypeProvenance: "future-field",
  };
  const { backend, state } = makeBackend({
    config: { health: richHealth, monitoringStatus: "active" },
  });

  const result = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });
  assert.equal(result.ok, true);

  const patch = state.patches[0];
  // Only the two columns the save owns are written.
  assert.deepEqual(Object.keys(patch).sort(), ["health", "monitoring_status"]);

  assert.equal(patch.health.notes, "kept for audit");
  assert.deepEqual(patch.health.tags, ["edge", "prod"]);
  assert.equal(patch.health.targetTypeProvenance, "future-field");
  assert.equal(patch.health.methodProvenance, "detected");
  assert.equal(patch.health.targetProvenance, "detected");
  // Only the field the operator actually replaced claims "configured".
  assert.equal(patch.health.endpointProvenance, "configured");
  assert.equal(patch.health.intervalSec, "30");
});

test("a cadence-only edit keeps the existing observation and check state", async () => {
  const { backend, state } = makeBackend();
  const result = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    intervalSec: "60",
  });

  assert.equal(result.ok, true);
  assert.match(result.message ?? "", /new timings/);
  assert.equal(state.patches[0].monitoring_status, undefined);
  assert.ok(!state.calls.includes("resetMonitoredService"));
  assert.ok(!state.calls.includes("updateProjectHealth"));
  assert.equal(state.config?.monitoringStatus, "active");
});

test("rejects invalid input before reading or writing configuration", async () => {
  const { backend, state } = makeBackend();
  const result = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    targetUrl: "ftp://example.com",
  });

  assert.equal(result.ok, false);
  assert.ok(result.fieldErrors?.targetUrl);
  assert.ok(!state.calls.includes("readConfig"));
  assert.ok(!state.calls.includes("updateConfig"));
  assert.equal(state.patches.length, 0);
});

test("an unauthenticated caller is refused before any project read", async () => {
  const { backend, state } = makeBackend({ userId: null });
  const result = await saveHealthConfigurationCore(backend, "project-1", INPUT);

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /session has expired/i);
  assert.deepEqual(state.calls, ["currentUserId"]);
});

test("a caller who cannot see the project gets no information and no write", async () => {
  const { backend, state } = makeBackend({ projectVisible: false });
  const result = await saveHealthConfigurationCore(backend, "someone-elses", INPUT);

  assert.equal(result.ok, false);
  assert.equal(result.error, "Project not found.");
  assert.ok(!state.calls.includes("readConfig"));
  assert.ok(!state.calls.includes("updateConfig"));
});

test("a database write failure is reported as a failure, not a save", async () => {
  const { backend, state } = makeBackend({ updateError: "connection reset" });
  const result = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /could not be saved/i);
  assert.ok(!state.calls.includes("resetMonitoredService"));
});

test("an update that matched no row (RLS no-op) is not reported as saved", async () => {
  const { backend, state } = makeBackend({ updateMatches: false });
  const result = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /not saved/i);
  assert.ok(!state.calls.includes("resetMonitoredService"));
});

test("a project without a stored configuration gets a clear error", async () => {
  const { backend, state } = makeBackend({ config: null });
  const result = await saveHealthConfigurationCore(backend, "project-1", INPUT);

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /no stored configuration/i);
  assert.ok(!state.calls.includes("updateConfig"));
});

test("saving /status/500 and reading it back, then saving the same value again", async () => {
  const { backend, state } = makeBackend();

  const first = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });
  assert.equal(first.ok, true);
  assert.equal(readBack(state)?.endpoint, "/status/500");

  const second = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });
  assert.equal(second.ok, true);
  // Identical probe identity: no reset and no status churn on a no-op re-save.
  assert.equal(state.patches[1].monitoring_status, undefined);
  assert.equal(
    state.calls.filter((c) => c === "resetMonitoredService").length,
    1,
  );
  assert.equal(readBack(state)?.endpoint, "/status/500");
});

test("project health is recomputed from the cleared service and its peers", async () => {
  const { backend, state } = makeBackend({ serviceStatuses: ["healthy", null] });
  const result = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });

  assert.equal(result.ok, true);
  // The cleared monitored service can no longer count as healthy.
  assert.equal(state.projectHealth, "unknown");

  const critical = makeBackend({ serviceStatuses: ["critical", null] });
  await saveHealthConfigurationCore(critical.backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });
  // Another service's real critical status is not masked by the reset.
  assert.equal(critical.state.projectHealth, "critical");
});

test("a missing monitoring migration saves the config and warns honestly", async () => {
  const { backend, state } = makeBackend({
    resetError: { message: "column does not exist", code: "42703", schemaMissing: true },
  });
  const result = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });

  assert.equal(result.ok, true, "the configuration write itself succeeded");
  assert.match(result.warning ?? "", /migration is not applied/i);
  assert.equal(readBack(state)?.endpoint, "/status/500");
  assert.ok(!state.calls.includes("updateProjectHealth"));
});

test("a project-health refresh failure is a warning, not a false failure", async () => {
  const { backend } = makeBackend({ statusesError: "boom" });
  const result = await saveHealthConfigurationCore(backend, "project-1", {
    ...INPUT,
    endpoint: "/status/500",
  });

  assert.equal(result.ok, true);
  assert.match(result.warning ?? "", /health summary could not be refreshed/i);
});
