/**
 * Scheduler resilience against a broken database client.
 *
 * A monitoring pass that cannot reach the database must report `ok:false` and
 * let the worker's pass-level backoff pace the retries — it must never throw
 * out of `runSchedulerTick`, and it must never be mistaken for "0 due".
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runSchedulerTick } from "../../lib/monitoring/scheduler";

type QueryStub = {
  select: (...args: unknown[]) => QueryStub;
  eq: (...args: unknown[]) => QueryStub;
  in: (...args: unknown[]) => QueryStub;
  or: (...args: unknown[]) => QueryStub;
  order: (...args: unknown[]) => QueryStub;
  limit: (...args: unknown[]) => QueryStub;
  maybeSingle: (...args: unknown[]) => QueryStub;
  update: (...args: unknown[]) => QueryStub;
  insert: (...args: unknown[]) => QueryStub;
  then: (resolve: (value: { data: null; error: { message: string; code: string } }) => void) => void;
};

function failingQuery(): QueryStub {
  const stub: QueryStub = {
    select: () => stub,
    eq: () => stub,
    in: () => stub,
    or: () => stub,
    order: () => stub,
    limit: () => stub,
    maybeSingle: () => stub,
    update: () => stub,
    insert: () => stub,
    then: (resolve) => resolve({ data: null, error: { message: "connection refused", code: "XX000" } }),
  };
  return stub;
}

test("a client that throws surfaces as a failed pass, not a rejection", async () => {
  const broken = {
    from() {
      throw new Error("connection refused");
    },
  } as unknown as SupabaseClient;
  const result = await runSchedulerTick({ supabase: broken, workerId: "test-worker" });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /connection refused/);
  assert.equal(result.checked, 0);
});

test("a client that reports query errors surfaces as a failed pass", async () => {
  const failing = { from: () => failingQuery() } as unknown as SupabaseClient;
  const result = await runSchedulerTick({ supabase: failing, workerId: "test-worker" });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /connection refused/);
  assert.equal(result.checked, 0);
  assert.equal(result.items.length, 0);
});