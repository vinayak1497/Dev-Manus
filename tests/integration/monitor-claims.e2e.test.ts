/**
 * The shared claim contract (`lib/monitoring/claims.ts`) against a REAL
 * database.
 *
 * Both the unattended worker and the manual "Run HTTP check" action claim a
 * service through these functions, so this file proves the guarantees both
 * depend on — with row locks, not mocks:
 *
 * - exactly one claimant wins;
 * - a live lease blocks everyone else;
 * - an expired lease is recoverable;
 * - completion and retry only write when the caller still owns the claim, so
 *   a slow check whose lease expired can never overwrite its replacement's
 *   cursor;
 * - shutdown releases only the stopping worker's claims.
 *
 * Requires E2E_SUPABASE_URL + E2E_SUPABASE_SECRET_KEY, like the scheduler
 * suite. Without them every test is SKIPPED.
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  claimDueCheck,
  claimManualCheck,
  completeClaimedCheck,
  releaseWorkerClaims,
  retryClaimedCheck,
} from "../../lib/monitoring/claims";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL?.trim();
const KEY = process.env.E2E_SUPABASE_SECRET_KEY?.trim();

if (!SUPABASE_URL || !KEY) {
  test("monitoring claim contract", (t) => {
    t.skip("set E2E_SUPABASE_URL and E2E_SUPABASE_SECRET_KEY");
  });
}

const RUN = `claims-${Date.now()}`;
let supabase: SupabaseClient;
let serviceId = "";
let orgId = "";
let userId = "";

async function serviceRow() {
  const { data } = await supabase
    .from("services")
    .select(
      "monitoring_run_id, monitoring_worker_id, monitoring_lease_expires_at, monitoring_next_check_at, monitoring_last_check_at, monitoring_last_status, monitoring_last_error",
    )
    .eq("id", serviceId)
    .single();
  return data!;
}

/** Clear the scheduling cursor so the service is claimable, as a pass that has finished would leave it. */
async function makeClaimable(): Promise<void> {
  await supabase
    .from("services")
    .update({
      monitoring_run_id: null,
      monitoring_worker_id: null,
      monitoring_lease_expires_at: null,
      monitoring_next_check_at: null,
    })
    .eq("id", serviceId);
}

before(async () => {
  supabase = createClient(SUPABASE_URL as string, KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user = await supabase.auth.admin.createUser({
    email: `${RUN}@example.com`,
    password: `pw-${RUN}-Aa1!`,
    email_confirm: true,
  });
  userId = user.data.user!.id;
  const org = (
    await supabase
      .from("organizations")
      .insert({ name: RUN, created_by: userId })
      .select("id")
      .single()
  ).data!;
  orgId = org.id;
  await supabase
    .from("organization_members")
    .insert({ organization_id: orgId, user_id: userId, role: "owner" });
  const project = (
    await supabase
      .from("projects")
      .insert({ organization_id: orgId, name: RUN, slug: RUN, created_by: userId })
      .select("id")
      .single()
  ).data!;
  await supabase.from("project_configs").insert({
    project_id: project.id,
    monitoring_enabled: true,
    health: {
      method: "http",
      targetUrl: "https://example.com",
      endpoint: "/",
      expectedStatus: "200",
      intervalSec: "30",
      timeoutSec: "5",
      failureThreshold: "3",
    },
  });
  const svc = (
    await supabase
      .from("services")
      .insert({ project_id: project.id, name: "Application endpoint", kind: "http-endpoint", is_demo: false })
      .select("id")
      .single()
  ).data!;
  serviceId = svc.id;
});

after(async () => {
  if (orgId) await supabase.from("organizations").delete().eq("id", orgId);
  if (userId) await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
});

test("monitoring claim contract", async (t) => {
  await t.test("exactly one of two concurrent claimants wins", async () => {
    const now = new Date();
    const [a, b] = await Promise.all([
      claimDueCheck(supabase, serviceId, "worker-a", randomUUID(), now, 120),
      claimDueCheck(supabase, serviceId, "worker-b", randomUUID(), now, 120),
    ]);
    assert.equal([a, b].filter(Boolean).length, 1, "one winner");
    const row = await serviceRow();
    assert.equal(row.monitoring_run_id !== null, true);
    assert.match(row.monitoring_worker_id!, /^worker-[ab]$/);
  });

  await t.test("completion only writes when the caller still owns the claim", async () => {
    const owner = (await serviceRow()).monitoring_worker_id as string;
    const runId = (await serviceRow()).monitoring_run_id as string;

    const foreign = await completeClaimedCheck(supabase, {
      serviceId,
      workerId: "somebody-else",
      runId,
      checkedAt: "2026-10-10T12:00:00.000Z",
      status: "healthy",
      intervalSec: 30,
    });
    assert.equal(foreign, false, "a stranger cannot complete the claim");
    const untouched = await serviceRow();
    assert.equal(untouched.monitoring_next_check_at, null);

    const owned = await completeClaimedCheck(supabase, {
      serviceId,
      workerId: owner,
      runId,
      checkedAt: "2026-10-10T12:00:00.000Z",
      status: "healthy",
      intervalSec: 30,
    });
    assert.equal(owned, true);
    const done = await serviceRow();
    // Postgres normalises the timestamp format, so compare instants.
    assert.equal(Date.parse(done.monitoring_last_check_at!), Date.parse("2026-10-10T12:00:00.000Z"));
    assert.equal(done.monitoring_last_status, "healthy");
    assert.equal(Date.parse(done.monitoring_next_check_at!), Date.parse("2026-10-10T12:00:30.000Z"));
    assert.equal(done.monitoring_run_id, null);
    assert.equal(done.monitoring_worker_id, null);
    assert.equal(done.monitoring_lease_expires_at, null);
  });

  await t.test("a retry only writes when the caller still owns the claim", async () => {
    await makeClaimable();
    const claimed = await claimDueCheck(supabase, serviceId, "worker-retry", randomUUID(), new Date(), 120);
    assert.equal(claimed, true);
    const row = await serviceRow();
    const runId = row.monitoring_run_id as string;

    const foreign = await retryClaimedCheck(supabase, {
      serviceId,
      workerId: "somebody-else",
      runId,
      nextCheckAt: "2026-10-10T12:05:00.000Z",
      error: "boom",
    });
    assert.equal(foreign, false);

    const owned = await retryClaimedCheck(supabase, {
      serviceId,
      workerId: "worker-retry",
      runId,
      nextCheckAt: "2026-10-10T12:05:00.000Z",
      error: "boom",
    });
    assert.equal(owned, true);
    const done = await serviceRow();
    assert.equal(Date.parse(done.monitoring_next_check_at!), Date.parse("2026-10-10T12:05:00.000Z"));
    assert.equal(done.monitoring_last_error, "boom");
    assert.equal(done.monitoring_run_id, null);
  });

  await t.test("a manual claim ignores due time but respects a live lease", async () => {
    // The service above has a future due time; a manual check still claims it.
    const manual = await claimManualCheck(
      supabase,
      serviceId,
      "manual:user",
      randomUUID(),
      new Date(),
      120,
    );
    assert.equal(manual, true, "manual checks are not gated by the schedule");

    const second = await claimManualCheck(supabase, serviceId, "manual:other", randomUUID(), new Date(), 120);
    assert.equal(second, false, "two simultaneous manual checks cannot both run");

    const workerBlocked = await claimDueCheck(supabase, serviceId, "worker-x", randomUUID(), new Date(), 120);
    assert.equal(workerBlocked, false, "the worker cannot take a manually claimed service");

    await releaseWorkerClaims(supabase, "manual:user");
    const afterRelease = await claimManualCheck(
      supabase,
      serviceId,
      "manual:other",
      randomUUID(),
      new Date(),
      120,
    );
    assert.equal(afterRelease, true, "releasing the claim lets the next check run");
    await releaseWorkerClaims(supabase, "manual:other");
  });

  await t.test("shutdown releases only the stopping worker's claims", async () => {
    await makeClaimable();
    const claimed = await claimDueCheck(supabase, serviceId, "worker-staying", randomUUID(), new Date(), 120);
    assert.equal(claimed, true);
    const released = await releaseWorkerClaims(supabase, "worker-staying");
    assert.equal(released, 1);
    const row = await serviceRow();
    assert.equal(row.monitoring_run_id, null);

    await claimDueCheck(supabase, serviceId, "worker-a", randomUUID(), new Date(), 120);
    const noneReleased = await releaseWorkerClaims(supabase, "worker-b");
    assert.equal(noneReleased, 0, "another worker's claim is untouched");
    const kept = await serviceRow();
    assert.equal(kept.monitoring_worker_id, "worker-a");
    await releaseWorkerClaims(supabase, "worker-a");
  });
});