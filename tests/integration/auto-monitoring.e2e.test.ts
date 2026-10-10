/**
 * Phase 2 end-to-end: automatic monitoring, proven against a REAL database.
 *
 * What is real here:
 * - a real Supabase/Postgres/PostgREST stack (the `supabase start` local
 *   stack, or any hosted project you point E2E_SUPABASE_URL at);
 * - the REAL Phase 2 migration, applied to that database;
 * - the REAL worker code path: `runSchedulerTick` -> `claimDueCheck` ->
 *   `runConfiguredHttpCheckCore` -> `runMonitorTick` -> `reconcileService`,
 *   including the `reconcileService` failure gate and the existing recovery /
 *   verification state machine. None of it is mocked.
 *
 * What is controlled (and why):
 * - The monitored TARGET. A local `node:http` server plays the deployed
 *   application, and only the outbound socket is redirected to it. The SSRF
 *   guards still run for real (the configured hostname genuinely resolves and
 *   genuinely has to be public), the request really goes over HTTP, and the
 *   response is really classified by `classifyHttpStatus`. Redirect handling,
 *   timeouts, SSRF refusal and the "refused target" path are all exercised
 *   unchanged. Nothing in the production code is relaxed for tests — there is
 *   no test-only switch anywhere in the probe.
 *
 * Why not a third-party website: an external endpoint makes the suite fail for
 * reasons that have nothing to do with this code. The only external
 * dependency is DNS for the SSRF pre-flight, which is production behaviour.
 *
 * Run it with:
 *   $env:E2E_SUPABASE_URL="http://127.0.0.1:54321"
 *   $env:E2E_SUPABASE_SECRET_KEY="<service role / sb_secret_ key>"
 *   npm run test:e2e
 *
 * Without those variables every test is SKIPPED with a printed reason — this
 * suite never silently passes because it could not connect.
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  runSchedulerTick,
  claimDueCheck,
  releaseWorkerClaims,
} from "../../lib/monitoring/scheduler";
import { runConfiguredHttpCheckCore } from "../../lib/monitoring/external-check";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL?.trim();
const KEY = process.env.E2E_SUPABASE_SECRET_KEY?.trim();

/**
 * The configured monitoring target. It must be a publicly resolvable hostname
 * so the production SSRF pre-flight genuinely passes; the request itself is
 * redirected to the local test origin.
 */
const TARGET = process.env.E2E_TARGET_URL?.trim() ?? "https://example.com/healthz";

if (!SUPABASE_URL || !KEY) {
  test("automatic monitoring end-to-end", (t) => {
    t.skip(
      "set E2E_SUPABASE_URL and E2E_SUPABASE_SECRET_KEY (see PHASE_2_MANUAL_TESTING_AND_DEPLOYMENT.md)",
    );
  });
}

type Mode = "healthy" | "failing";
let mode: Mode = "healthy";
let requests: string[] = [];
let server: Server | null = null;
let localBase = "";
const realFetch = globalThis.fetch;

const RUN = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const USER_EMAIL = `${RUN}@example.com`;
const PASSWORD = `pw-${RUN}-Aa1!`;

let supabase: SupabaseClient;
let projectId = "";
let brokenProjectId = "";
let disabledProjectId = "";
let serviceId = "";
let orgId = "";
let userId = "";

/** Health configuration exactly as the onboarding wizard stores it. */
function healthJson(overrides: Record<string, string> = {}) {
  return {
    method: "http",
    targetType: "external_url",
    targetUrl: TARGET.replace(/\/[^/]*$/, ""),
    endpoint: "/healthz",
    expectedStatus: "200",
    intervalSec: "10",
    timeoutSec: "5",
    failureThreshold: "3",
    ...overrides,
  };
}

const createdOrgIds: string[] = [];

async function createProject(slug: string, health: unknown, enabled = true) {
  const org = (
    await supabase
      .from("organizations")
      .insert({ name: `org-${slug}`, created_by: userId })
      .select("id")
      .single()
  ).data!;
  createdOrgIds.push(org.id as string);
  await supabase
    .from("organization_members")
    .insert({ organization_id: org.id, user_id: userId, role: "owner" });
  const project = (
    await supabase
      .from("projects")
      .insert({ organization_id: org.id, name: slug, slug, created_by: userId })
      .select("id")
      .single()
  ).data!;
  await supabase.from("project_configs").insert({
    project_id: project.id,
    monitoring_enabled: enabled,
    health: health as never,
    branch: "main",
    repository_provider: "github",
  });
  return { orgId: org.id as string, projectId: project.id as string };
}

/** Make a service due "now", exactly as elapsed time would have. */
async function makeDue(project: string): Promise<void> {
  await supabase
    .from("services")
    .update({ monitoring_next_check_at: new Date(Date.now() - 1000).toISOString() })
    .eq("project_id", project)
    .eq("name", "Application endpoint");
}

async function observations(project: string) {
  const { data } = await supabase
    .from("service_health_checks")
    .select("id, status, source, is_demo, detail, metadata, checked_at, latency_ms")
    .eq("project_id", project)
    .order("checked_at", { ascending: true });
  return data ?? [];
}

async function activeIncidents(project: string) {
  const { data } = await supabase
    .from("incidents")
    .select("id, status, severity, title, resolved_at")
    .eq("project_id", project)
    .neq("status", "resolved")
    .order("detected_at", { ascending: true });
  return data ?? [];
}

before(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    requests.push(`${req.method} ${url}`);
    res.on("error", () => undefined);
    if (url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (url === "/fail") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "down" }));
      return;
    }
    if (url === "/slow") {
      setTimeout(() => {
        if (!res.destroyed) {
          try {
            res.writeHead(200);
            res.end("late");
          } catch {
            /* client gone */
          }
        }
      }, 3000);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.unref();
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  localBase = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;

  // Only the monitoring probe's outbound socket is redirected. Every other
  // fetch — above all supabase-js's own PostgREST/Auth traffic — passes
  // straight through, and every other aspect of the probe (SSRF resolution,
  // redirect handling, timeout classification, body discard) runs exactly as
  // it does in production.
  const targetHost = new URL(TARGET).host;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const parsed = new URL(raw);
    if (parsed.host !== targetHost) return realFetch(input as RequestInfo, init);
    const path = mode === "failing" ? "/fail" : "/healthz";
    return realFetch(`${localBase}${path}`, init);
  }) as typeof fetch;

  supabase = createClient(SUPABASE_URL as string, KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const created = await supabase.auth.admin.createUser({
    email: USER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw new Error(`could not create the E2E user: ${created.error.message}`);
  userId = created.data.user!.id;

  const main = await createProject(`${RUN}-primary`, healthJson());
  projectId = main.projectId;
  orgId = main.orgId;

  // A project whose target the production SSRF guard refuses.
  const broken = await createProject(`${RUN}-blocked`, healthJson({ targetUrl: "http://localhost:3000" }));
  brokenProjectId = broken.projectId;

  // A project an operator switched automatic monitoring off for.
  const disabled = await createProject(`${RUN}-disabled`, healthJson(), false);
  disabledProjectId = disabled.projectId;
});

after(async () => {
  globalThis.fetch = realFetch;
  // Deleting the organizations cascades to projects -> project_configs,
  // services -> observations -> incidents, so one delete is both complete and
  // impossible to half-apply.
  for (const id of createdOrgIds) {
    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) console.error(`e2e cleanup failed for org ${id}: ${error.message}`);
  }
  if (userId) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) console.error(`e2e cleanup failed for user: ${error.message}`);
  }
  if (server) {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
});

test("automatic monitoring end-to-end", async (t) => {
  await t.test("a due project is discovered and checked with no user interaction", async () => {
    requests = [];
    const result = await runSchedulerTick({ supabase, workerId: `${RUN}-worker-1` });
    assert.equal(result.ok, true, result.error);
    // Scoped to this run's own project so the assertions describe THIS
    // behaviour rather than whatever else happens to be enabled in the
    // database the operator pointed at.
    assert.equal(result.eligible >= 1, true, JSON.stringify(result.items));
    assert.equal(result.checked >= 1, true, JSON.stringify(result.items));

    const rows = await observations(projectId);
    const external = rows.filter((r) => r.source === "external");
    assert.equal(external.length, 1, "exactly one genuine observation");
    assert.equal(external[0].status, "healthy");
    assert.equal(external[0].is_demo, false);
    assert.equal((external[0].metadata as { status_code: number }).status_code, 200);
    assert.ok(external[0].latency_ms !== null && external[0].latency_ms >= 0);
    assert.ok(requests.length >= 1, "a real HTTP request reached the target");

    const { data: svc } = await supabase
      .from("services")
      .select("id, status, is_demo, monitoring_last_check_at, monitoring_next_check_at, monitoring_last_status")
      .eq("project_id", projectId)
      .eq("name", "Application endpoint")
      .single();
    serviceId = svc!.id;
    assert.equal(svc!.is_demo, false);
    assert.equal(svc!.monitoring_last_status, "healthy");
    assert.ok(svc!.monitoring_last_check_at);
    // intervalSec = 10 -> the next check is ~10s after the OBSERVATION.
    const gap =
      Date.parse(svc!.monitoring_next_check_at!) - Date.parse(svc!.monitoring_last_check_at!);
    assert.ok(gap >= 9_000 && gap <= 12_000, `intervalSec honoured, gap=${gap}ms`);
    assert.equal((await activeIncidents(projectId)).length, 0);

    // The claim was released after a successful check.
    assert.equal(svc!.monitoring_last_check_at !== null, true);
    const { data: afterClaim } = await supabase
      .from("services")
      .select("monitoring_lease_expires_at, monitoring_worker_id")
      .eq("id", svc!.id)
      .single();
    assert.equal(afterClaim!.monitoring_lease_expires_at, null);
    assert.equal(afterClaim!.monitoring_worker_id, null);
  });

  await t.test("monitoring_status moves from pending to active after a real check", async () => {
    const { data } = await supabase
      .from("project_configs")
      .select("monitoring_status")
      .eq("project_id", projectId)
      .single();
    assert.equal(data!.monitoring_status, "active");
  });

  await t.test("a project that is not due yet is skipped, with no extra observation", async () => {
    requests = [];
    const result = await runSchedulerTick({ supabase, workerId: `${RUN}-worker-1` });
    assert.equal(result.checked, 0);
    assert.equal(result.skipped >= 2, true, JSON.stringify(result.items));
    assert.equal(requests.length, 0, "no HTTP request for a service that is not due");
    assert.equal((await observations(projectId)).filter((r) => r.source === "external").length, 1);
  });

  await t.test("another worker instance also respects the persisted due time", async () => {
    // Proves scheduling state survives a process restart: a brand new worker
    // id, no in-memory state, still refuses to check early.
    const result = await runSchedulerTick({ supabase, workerId: `${RUN}-worker-restarted` });
    assert.equal(result.checked, 0);
    assert.equal(result.skipped >= 2, true);
  });

  await t.test("two concurrent passes cannot check the same service twice", async () => {
    await makeDue(projectId);
    requests = [];
    const [a, b] = await Promise.all([
      runSchedulerTick({ supabase, workerId: `${RUN}-worker-a`, projectId }),
      runSchedulerTick({ supabase, workerId: `${RUN}-worker-b`, projectId }),
    ]);
    const checked = a.checked + b.checked;
    assert.equal(checked, 1, `exactly one worker ran the check (a=${a.checked} b=${b.checked})`);
    assert.equal((await observations(projectId)).filter((r) => r.source === "external").length, 2);
  });

  await t.test("the configured failureThreshold gates the incident, and every check is still recorded", async () => {
    mode = "failing";
    const baseline = (await observations(projectId)).filter((r) => r.source === "external").length;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await makeDue(projectId);
      const result = await runSchedulerTick({ supabase, workerId: `${RUN}-worker-1`, projectId });
      assert.equal(result.checked, 1, `attempt ${attempt} ran a real check`);
      const rows = await observations(projectId);
      const external = rows.filter((r) => r.source === "external");
      assert.equal(external.length, baseline + attempt, `every real check is recorded (${external.length})`);
      assert.equal(external[external.length - 1].status, "critical");
      const active = await activeIncidents(projectId);
      if (attempt < 3) {
        assert.equal(active.length, 0, `no incident after ${attempt} consecutive failure(s)`);
        // The real failure is still visible on the service while the
        // threshold is pending.
        const { data: svc } = await supabase
          .from("services")
          .select("status")
          .eq("id", serviceId)
          .single();
        assert.equal(svc!.status, "critical");
      } else {
        assert.equal(active.length, 1, "exactly one incident at the threshold");
        assert.equal(active[0].severity, "critical");
        assert.match(active[0].title, /failing health checks/);
      }
    }
  });

  await t.test("repeated failures never create a duplicate active incident", async () => {
    const baseline = (await observations(projectId)).filter((r) => r.source === "external").length;
    for (let extra = 0; extra < 2; extra += 1) {
      await makeDue(projectId);
      await runSchedulerTick({ supabase, workerId: `${RUN}-worker-1`, projectId });
    }
    assert.equal((await activeIncidents(projectId)).length, 1);
    const rows = await observations(projectId);
    assert.equal(rows.filter((r) => r.source === "external").length, baseline + 2);
  });

  await t.test("the existing recovery verification resolves the incident", async () => {
    mode = "healthy";
    // DEFAULT_VERIFICATION_CHECKS = 3: begin(1/3), advance(2/3), advance(3/3).
    for (let i = 1; i <= 3; i += 1) {
      await makeDue(projectId);
      await runSchedulerTick({ supabase, workerId: `${RUN}-worker-1`, projectId });
      const active = await activeIncidents(projectId);
      if (i < 3) {
        assert.equal(active.length, 1, `still verifying after ${i} healthy check(s)`);
        assert.equal(active[0].status, "monitoring");
      }
    }
    assert.equal((await activeIncidents(projectId)).length, 0, "incident resolved");
    const { data: incident } = await supabase
      .from("incidents")
      .select("status, resolved_at")
      .eq("project_id", projectId)
      .order("detected_at", { ascending: true })
      .limit(1)
      .single();
    assert.equal(incident!.status, "resolved");
    assert.ok(incident!.resolved_at);

    const { data: verification } = await supabase
      .from("verification_runs")
      .select("status, checks_passed, checks_required")
      .eq("status", "passed")
      .limit(1);
    assert.equal(verification!.length, 1, "the verification run is persisted as passed");
    assert.equal(verification![0].checks_required, 3);

    const { data: svc } = await supabase
      .from("services")
      .select("status")
      .eq("id", serviceId)
      .single();
    assert.equal(svc!.status, "healthy");
  });

  await t.test("a healthy observation resets the consecutive-failure sequence", async () => {
    mode = "failing";
    await makeDue(projectId);
    await runSchedulerTick({ supabase, workerId: `${RUN}-worker-1`, projectId });
    await makeDue(projectId);
    await runSchedulerTick({ supabase, workerId: `${RUN}-worker-1`, projectId });
    assert.equal((await activeIncidents(projectId)).length, 0, "two failures after a recovery: no incident");

    mode = "healthy";
    await makeDue(projectId);
    await runSchedulerTick({ supabase, workerId: `${RUN}-worker-1`, projectId });

    mode = "failing";
    await makeDue(projectId);
    await runSchedulerTick({ supabase, workerId: `${RUN}-worker-1`, projectId });
    assert.equal(
      (await activeIncidents(projectId)).length,
      0,
      "a new sequence starts from 1 after the recovery",
    );
  });

  await t.test("a target refused by the SSRF guard records no observation and does not stop the batch", async () => {
    const before = await observations(brokenProjectId);
    await makeDue(brokenProjectId);
    const result = await runSchedulerTick({
      supabase,
      workerId: `${RUN}-worker-1`,
      projectId: brokenProjectId,
    });
    assert.equal(result.checked, 0);
    assert.equal(result.failed, 1);
    const { data: svc } = await supabase
      .from("services")
      .select("monitoring_last_error, monitoring_next_check_at")
      .eq("project_id", brokenProjectId)
      .eq("name", "Application endpoint")
      .single();
    assert.match(svc!.monitoring_last_error!, /Refusing to check internal target/);
    assert.ok(svc!.monitoring_next_check_at, "the retry is scheduled");
    assert.equal((await observations(brokenProjectId)).length, before.length);
  });

  await t.test("automatic monitoring switched off is never selected", async () => {
    const result = await runSchedulerTick({
      supabase,
      workerId: `${RUN}-worker-1`,
      projectId: disabledProjectId,
    });
    assert.equal(result.eligible, 0);
    assert.equal(result.checked, 0);
    const { data } = await supabase
      .from("services")
      .select("id")
      .eq("project_id", disabledProjectId);
    assert.equal((data ?? []).length, 0, "no service row is created for a disabled project");
  });

  await t.test("a broken project does not stop the healthy ones in the same batch", async () => {
    mode = "healthy";
    await makeDue(projectId);
    await makeDue(brokenProjectId);
    const result = await runSchedulerTick({ supabase, workerId: `${RUN}-worker-batch` });
    const mine = result.items.filter((i) => i.projectId === projectId);
    const broken = result.items.filter((i) => i.projectId === brokenProjectId);
    assert.equal(broken[0]?.outcome, "check_failed", JSON.stringify(broken));
    assert.equal(mine[0]?.outcome, "checked", JSON.stringify(mine));
  });

  await t.test("an expired claim is recoverable, so a crashed worker strands nothing", async () => {
    await makeDue(projectId);
    const now = new Date();
    const won = await claimDueCheck(
      supabase,
      serviceId,
      `${RUN}-crashed-worker`,
      "99999999-9999-4999-8999-999999999999",
      now,
      120,
    );
    assert.equal(won, true);
    const blocked = await claimDueCheck(
      supabase,
      serviceId,
      `${RUN}-other-worker`,
      "88888888-8888-4888-8888-888888888888",
      now,
      120,
    );
    assert.equal(blocked, false, "a live lease blocks a second worker");

    // Simulate the first worker dying: its lease ages out.
    await supabase
      .from("services")
      .update({
        monitoring_lease_expires_at: new Date(now.getTime() - 1000).toISOString(),
      })
      .eq("id", serviceId);
    const recovered = await claimDueCheck(
      supabase,
      serviceId,
      `${RUN}-rescuer`,
      "77777777-7777-4777-8777-777777777777",
      new Date(now.getTime() + 1000),
      120,
    );
    assert.equal(recovered, true, "the abandoned work is claimable again");
    await releaseWorkerClaims(supabase, `${RUN}-rescuer`);
  });

  await t.test("a retried write records the observation exactly once", async () => {
    await makeDue(projectId);
    const runId = crypto.randomUUID();
    const before = (await observations(projectId)).filter((r) => r.source === "external").length;
    const first = await runConfiguredHttpCheckCore({
      supabase,
      projectId,
      serviceId,
      observationId: runId,
      userId: null,
    });
    const retry = await runConfiguredHttpCheckCore({
      supabase,
      projectId,
      serviceId,
      observationId: runId,
      userId: null,
    });
    assert.equal(first.ok, true, first.error);
    assert.equal(retry.ok, true, retry.error);
    const after = (await observations(projectId)).filter((r) => r.source === "external").length;
    assert.equal(after - before, 1, "a repeated write of the same run adds no second observation");
  });
});