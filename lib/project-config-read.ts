import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingSchema } from "./incidents";
import {
  normalizeStoredConfig,
  type StoredConfigRow,
  type StoredEnvRow,
  type StoredProjectConfig,
} from "./onboarding/stored-config";

/**
 * Supabase IO for the stored onboarding configuration, with the client
 * injected by the caller.
 *
 * `lib/project-config.ts` is the Next.js entry point for this read: it builds
 * a cookie-scoped client and delegates here. The automatic monitoring worker
 * has no request, no cookies and no user session, so it builds a service-role
 * client and calls the very same function. Keeping one implementation is what
 * guarantees the worker's idea of "is this project configured?" is identical
 * to the dashboard's.
 *
 * Secret safety is unchanged and still structural: `project_env_vars.value` is
 * absent from the select list, so a secret value cannot reach the caller even
 * if a row were malformed (RULE.md 10, 24).
 */
export async function readProjectConfig(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ config: StoredProjectConfig | null; schemaMissing: boolean }> {
  const [configResult, envResult] = await Promise.all([
    supabase
      .from("project_configs")
      .select(
        "monitoring_status, branch, repository_provider, deployment, runtime, dependencies, health",
      )
      .eq("project_id", projectId)
      .maybeSingle(),
    // NOTE: `value` is intentionally absent from this select list.
    supabase
      .from("project_env_vars")
      .select("key, is_secret, has_value")
      .eq("project_id", projectId),
  ]);

  if (configResult.error && isMissingSchema(configResult.error.code)) {
    return { config: null, schemaMissing: true };
  }
  if (envResult.error && isMissingSchema(envResult.error.code)) {
    return { config: null, schemaMissing: true };
  }

  // RLS hides other tenants' rows; a missing config row is an honest "not
  // configured yet" rather than an error.
  if (!configResult.data) return { config: null, schemaMissing: false };

  return {
    config: normalizeStoredConfig(
      configResult.data as StoredConfigRow,
      (envResult.data ?? []) as StoredEnvRow[],
    ),
    schemaMissing: false,
  };
}

/**
 * Whether automatic monitoring is switched on for this project.
 *
 * Deliberately a SEPARATE, narrow read rather than a new column in the select
 * list above: adding `monitoring_enabled` to that list would make every
 * configuration read fail (PostgREST `42703`) on any database where the
 * Phase 2 migration has not been applied yet, taking the dashboard's existing
 * "Monitoring configuration" card down with it. Here a missing column simply
 * reads as `null` — "unknown", never a fabricated "off" or "on".
 *
 * Returns:
 * - `true`  — automatic monitoring is explicitly enabled
 * - `false` — an operator switched it off
 * - `null`  — not configured, unreadable, or the migration is not applied yet
 */
export async function readAutomaticMonitoringEnabled(
  supabase: SupabaseClient,
  projectId: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("project_configs")
    .select("monitoring_enabled")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  const raw = (data as { monitoring_enabled?: unknown }).monitoring_enabled;
  return typeof raw === "boolean" ? raw : null;
}