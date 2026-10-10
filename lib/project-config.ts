import { createClient } from "@/lib/supabase/server";
import { readProjectConfig } from "./project-config-read";
import type { StoredProjectConfig } from "./onboarding/stored-config";

export type {
  MonitoringStatus,
  StoredConfigRow,
  StoredDependencies,
  StoredDeployment,
  StoredEnvRow,
  StoredHealth,
  StoredProjectConfig,
  StoredRuntime,
} from "./onboarding/stored-config";

/**
 * Read-back of the onboarding configuration a project was created with.
 *
 * This closes the loop the wizard opens. Before this existed, `project_configs`
 * and `project_env_vars` were write-only: every value captured in steps 1-9 was
 * stored and then never read again, so the dashboard could not tell the user
 * what was actually being monitored (RULE.md — no field may exist that the
 * application silently ignores).
 *
 * The Supabase query itself lives in `lib/project-config-read.ts` with an
 * injected client, so this Next.js wrapper and the unattended monitoring
 * worker share exactly one implementation of "what did onboarding store?".
 *
 * Secret safety: the env-var query selects `key, is_secret, has_value` ONLY.
 * The `value` column is never requested, so a secret value cannot reach the
 * server component even if a row were malformed. `project_env_vars.value` is
 * NULL for secrets by schema constraint, but "not selected" is a stronger
 * guarantee than "expected to be NULL" (RULE.md §10, §24).
 */

/**
 * Load the stored configuration for one project.
 *
 * RLS scopes both reads to projects the caller can access
 * (`can_access_project`), so a caller who cannot see the project gets `null`
 * here exactly as they get a 404 from the project read itself.
 */
export async function loadProjectConfig(
  projectId: string,
): Promise<{ config: StoredProjectConfig | null; schemaMissing: boolean }> {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return { config: null, schemaMissing: false };
  return readProjectConfig(supabase, projectId);
}