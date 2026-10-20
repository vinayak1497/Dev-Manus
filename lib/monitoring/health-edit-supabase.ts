/**
 * Supabase adapter for the editable-health save path.
 *
 * Server-only: it is imported by the server action, never by a client
 * component, and it uses the cookie-scoped anon client — the same RLS
 * enforcement as every other authenticated write in this app. No service-role
 * key is involved, so a caller can only ever update a project whose
 * `can_access_project()` is true.
 *
 * The adapter deliberately exposes only the operations the save core needs.
 * There is no "trust this private host" operation here, and no observation
 * insert: saving configuration is not evidence, and private-target trust stays
 * an operator-only worker setting (`MONITOR_ALLOWED_PRIVATE_HOSTS`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import { isMissingSchema } from "../incidents";
import {
  MONITORED_SERVICE_NAME,
  monitoredServiceDescription,
} from "./external-check";
import type { HealthEditBackend } from "./health-edit";

function describe(error: { message: string; code?: string }) {
  return { message: error.message, code: error.code };
}

export function createSupabaseHealthEditBackend(
  supabase: SupabaseClient<Database>,
): HealthEditBackend {
  return {
    async currentUserId() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },

    async findProject(projectId) {
      // Mirrors canSeeProject(): RLS returns no row for another tenant, and a
      // read error fails closed rather than granting access.
      const { data } = await supabase
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .maybeSingle();
      return Boolean(data);
    },

    async readConfig(projectId) {
      const { data, error } = await supabase
        .from("project_configs")
        .select("health, monitoring_status")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) return { ok: false, error: describe(error) };
      if (!data) return { ok: true, row: null };
      return {
        ok: true,
        row: { health: data.health, monitoringStatus: data.monitoring_status },
      };
    },

    async updateConfig(projectId, patch) {
      // Only the health JSONB (and, for a changed target, monitoring_status) is
      // written. Every other project_configs column is untouched by construction.
      const update: Database["public"]["Tables"]["project_configs"]["Update"] = {
        health: patch.health as Json,
      };
      if (patch.monitoring_status) {
        update.monitoring_status = patch.monitoring_status;
      }
      const { data, error } = await supabase
        .from("project_configs")
        .update(update)
        .eq("project_id", projectId)
        .select("project_id");
      if (error) return { ok: false, error: describe(error) };
      return { ok: true, updated: Array.isArray(data) && data.length > 0 };
    },

    async resetMonitoredService(projectId, checkedUrl) {
      const { data, error } = await supabase
        .from("services")
        .update({
          status: null,
          monitoring_last_check_at: null,
          monitoring_next_check_at: null,
          monitoring_last_status: null,
          monitoring_last_error: null,
          monitoring_run_id: null,
          monitoring_lease_expires_at: null,
          monitoring_worker_id: null,
          // The description is the row's audit label. Leaving the previous URL
          // there would name a target that is no longer configured.
          ...(checkedUrl ? { description: monitoredServiceDescription(checkedUrl) } : {}),
        })
        .eq("project_id", projectId)
        .eq("name", MONITORED_SERVICE_NAME)
        .eq("is_demo", false)
        .select("id");
      if (error) {
        return {
          ok: false,
          error: describe(error),
          // 42703 (undefined column) means the Phase 2 migration is missing.
          schemaMissing: error.code === "42703" || isMissingSchema(error.code),
        };
      }
      return { ok: true, reset: Array.isArray(data) ? data.length : 0 };
    },

    async readServiceStatuses(projectId) {
      const { data, error } = await supabase
        .from("services")
        .select("status")
        .eq("project_id", projectId);
      if (error) return { ok: false, error: describe(error) };
      return {
        ok: true,
        statuses: ((data ?? []) as { status: string | null }[]).map(
          (row) => row.status,
        ),
      };
    },

    async updateProjectHealth(projectId, health) {
      const { error } = await supabase
        .from("projects")
        .update({ health })
        .eq("id", projectId);
      if (error) return { ok: false, error: describe(error) };
      return { ok: true };
    },
  };
}
