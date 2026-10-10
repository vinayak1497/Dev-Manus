import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Server-only Supabase client with the SERVICE ROLE, for the background
 * monitoring worker.
 *
 * Why this exists at all
 * ----------------------
 * Every other Supabase client in this repository is anon-key + session cookie,
 * and RLS scopes it to `auth.uid()`. The monitoring worker has no request, no
 * cookies and no user: it must monitor EVERY tenant's project on a timer. A
 * session-scoped client would return zero rows for every project, silently,
 * which is the worst possible failure mode for a monitoring system.
 *
 * This module is therefore the ONE place in the repository that deliberately
 * runs above RLS, and it is defended accordingly:
 *
 * - Server-only by construction. It lives outside `app/` and `components/`, so
 *   Next.js never bundles it; nothing imports it from a route handler, a page
 *   or a client component. `assertServerOnly()` fails loudly if a browser ever
 *   manages to evaluate it.
 * - The key is read from a non-public environment variable and is never
 *   returned, logged, or attached to any response (RULE.md 11).
 * - It performs no browser work: `persistSession`/`autoRefreshToken` are off,
 *   so no token is ever written to storage.
 * - It is still tenant-safe by construction of the QUERIES, not by hope: the
 *   worker only ever selects project ids from `project_configs` where
 *   automatic monitoring is enabled, and only ever writes rows for those
 *   projects. No user-supplied identifier from a request can reach it.
 *
 * What it must never be used for: reading a project because a caller supplied
 * its id. That is `canSeeProject` + RLS, and it stays that way.
 */

/** Fail fast if this module is ever evaluated in a browser context. */
function assertServerOnly(): void {
  // `globalThis` rather than a bare `window`, so this file also typechecks
  // under the worker's Node-only tsconfig.
  const isBrowser = typeof (globalThis as { window?: unknown }).window !== "undefined";
  if (isBrowser) {
    throw new Error(
      "lib/supabase/service-role must never run in a browser. The service-role key is a secret.",
    );
  }
}

export type ServiceRoleClientOptions = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

/**
 * Build the worker's database client.
 *
 * The key is passed in explicitly (never read from `process.env` here) so this
 * module stays a pure factory and so the startup validation in
 * `lib/monitoring/worker-config.ts` remains the single place that decides
 * whether the worker is configured.
 */
export function createServiceRoleClient(
  options: ServiceRoleClientOptions,
) {
  assertServerOnly();
  return createClient<Database>(options.supabaseUrl, options.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export type { Database };