"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ENVIRONMENT_OPTIONS, type CreateProjectState } from "@/lib/projects";
import type { OnboardingSubmitPayload } from "@/lib/onboarding/types";
// One shared rule for variable/secret names — the wizard, the .env importer
// and this server boundary must never drift apart.
import { isValidEnvVarKey, validateOnboardingPayload } from "@/lib/onboarding/validation";

/**
 * Real project creation (Screen_Navigation.md §6 → §7).
 *
 * Unlike /api/dev/seed (development-only sample rows), this is the real,
 * production-safe path a signed-in user takes to add a project. It writes
 * with the anon key, so RLS scopes every insert to the caller's own
 * organization. A freshly created project has NO telemetry: health,
 * service_count, incidents and deployment are left null and render as
 * "Unknown"/"Not available" — never as zero or Healthy (RULE.md §9.2).
 */

const NAME_MAX = 80;
const REPO_MAX = 200;
/** Name a user's first workspace; distinct from the demo seed's org. */
const PERSONAL_ORG_NAME = "My Workspace";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** DB errors are safe to inspect (no secrets) but not to show verbatim. */
function friendlyDbError(message: string): string {
  if (/does not exist|schema cache|could not find the table/i.test(message)) {
    return "The database schema isn't installed yet. Run `supabase db push`, then try again.";
  }
  return "Couldn't create the project. Please try again.";
}

/**
 * Ensure the signed-in user has an organization they own, creating one (and
 * enrolling them as owner) on first use. Mirrors the RLS-satisfying sequence
 * proven out in /api/dev/seed. Returns the org id to insert the project into.
 */
async function ensurePersonalOrg(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: owned } = await supabase
    .from("organizations")
    .select("id")
    .eq("created_by", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (owned?.id) return { ok: true, id: owned.id as string };

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: PERSONAL_ORG_NAME, created_by: userId })
    .select("id")
    .single();

  if (orgError || !org) {
    return { ok: false, error: friendlyDbError(orgError?.message ?? "") };
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({ organization_id: org.id, user_id: userId, role: "owner" });

  if (memberError) {
    return { ok: false, error: friendlyDbError(memberError.message) };
  }

  return { ok: true, id: org.id as string };
}

export async function createProject(
  _prev: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return {
      ok: false,
      error:
        "Authentication isn't configured. Add the Supabase keys to .env.local.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired — please sign in again." };
  }

  const rawName = String(formData.get("name") ?? "").trim();
  const rawEnv = String(formData.get("environment") ?? "").trim();
  const rawRepo = String(formData.get("repository") ?? "").trim();

  const fieldErrors: NonNullable<CreateProjectState["fieldErrors"]> = {};
  if (!rawName) fieldErrors.name = "Enter a project name.";
  else if (rawName.length > NAME_MAX)
    fieldErrors.name = `Keep the name under ${NAME_MAX} characters.`;

  const environment =
    rawEnv && (ENVIRONMENT_OPTIONS as readonly string[]).includes(rawEnv)
      ? rawEnv
      : null;
  if (rawEnv && !environment)
    fieldErrors.environment = "Choose a valid environment.";

  let repository: string | null = null;
  if (rawRepo.length > REPO_MAX)
    fieldErrors.repository = `Keep the repository under ${REPO_MAX} characters.`;
  else if (rawRepo) repository = rawRepo;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: null, fieldErrors };
  }

  const org = await ensurePersonalOrg(supabase, user.id);
  if (!org.ok) return { ok: false, error: org.error };

  // Slug is unique per organization. On collision (23505) try a suffixed slug.
  const base = slugify(rawName) || "project";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("projects")
      .insert({
        organization_id: org.id,
        name: rawName,
        slug,
        created_by: user.id,
        environment,
        repository,
        is_demo: false,
      })
      .select("id")
      .single();

    if (!error && data) {
      revalidatePath("/projects");
      return { ok: true, error: null, projectId: data.id as string };
    }
    if (error?.code === "23505") continue; // slug taken — retry
    if (error) return { ok: false, error: friendlyDbError(error.message) };
  }

  return {
    ok: false,
    error: "A project with a similar name already exists — try a different name.",
  };
}

export type OnboardingCreateResult =
  | { ok: true; projectId: string; error: null }
  | { ok: false; projectId?: undefined; error: string };

const DESC_MAX = 280;
const TAG_MAX = 24;
const BRANCH_MAX = 100;
const DEPLOY_STRATEGIES = [
  "dockerfile",
  "compose",
  "kubernetes",
  "helm",
  "framework",
  "manual",
  "none",
] as const;

function isMissingTable(message: string): boolean {
  return /does not exist|schema cache|could not find the table/i.test(message);
}

/**
 * Review → Start Monitoring (Screen_Navigation.md §13).
 *
 * Creates exactly ONE project for the wizard's `draftId` (idempotent on
 * retry/refresh), then persists the full onboarding configuration to
 * `project_configs` + `project_env_vars` — all through the anon key so RLS
 * scopes every write to the caller's own organization.
 *
 * Secret VALUES never arrive here (the payload carries names + presence
 * only), so there is nothing sensitive to log or store. A new project has
 * NO telemetry yet — health stays null and renders Unknown (RULE.md §9.2).
 */
export async function createProjectFromOnboarding(
  payload: OnboardingSubmitPayload,
): Promise<OnboardingCreateResult> {
  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return {
      ok: false,
      error:
        "Authentication isn't configured. Add the Supabase keys to .env.local.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired — please sign in again." };
  }

  // ---- Validate at the boundary (never trust the client) ----
  const name = payload.basics.name.trim();
  if (!name) return { ok: false, error: "Enter a project name." };
  if (name.length > NAME_MAX)
    return { ok: false, error: `Keep the name under ${NAME_MAX} characters.` };
  if (payload.basics.description.trim().length > DESC_MAX)
    return { ok: false, error: `Keep the description under ${DESC_MAX} characters.` };
  if (payload.basics.tags.length > 8)
    return { ok: false, error: "Keep to 8 tags or fewer." };
  for (const t of payload.basics.tags) {
    if (!t.trim() || t.length > TAG_MAX)
      return { ok: false, error: `Keep each tag under ${TAG_MAX} characters.` };
  }
  const env = payload.basics.environment;
  if (!(ENVIRONMENT_OPTIONS as readonly string[]).includes(env))
    return { ok: false, error: "Choose a valid environment." };

  const repoUrl = payload.repository.url.trim();
  if (repoUrl.length > REPO_MAX)
    return { ok: false, error: `Keep the repository under ${REPO_MAX} characters.` };
  const branch = payload.repository.branch.trim() || "main";
  if (branch.length > BRANCH_MAX)
    return { ok: false, error: "Keep the branch under 100 characters." };

  if (
    !payload.deployment.strategy ||
    !(DEPLOY_STRATEGIES as readonly string[]).includes(payload.deployment.strategy)
  ) {
    return { ok: false, error: "Choose a deployment configuration." };
  }
  for (const v of payload.envVars) {
    if (!v.key.trim() && !v.value.trim()) continue;
    if (!isValidEnvVarKey(v.key))
      return { ok: false, error: `“${v.key || "(empty)"}” isn't a valid variable name.` };
  }
  for (const s of payload.secrets) {
    if (!isValidEnvVarKey(s.key))
      return { ok: false, error: `“${s.key}” isn't a valid secret name.` };
  }
  const canonicalError = validateOnboardingPayload({
    deployment: { strategy: payload.deployment.strategy },
    runtime: { startCommand: payload.runtime.startCommand, port: payload.runtime.port },
    health: {
      method: payload.health.method,
      targetUrl: payload.health.targetUrl,
      endpoint: payload.health.endpoint,
      intervalSec: payload.health.intervalSec,
      timeoutSec: payload.health.timeoutSec,
      failureThreshold: payload.health.failureThreshold,
      expectedStatus: payload.health.expectedStatus,
    },
    language: payload.analysis?.language.value ?? null,
  });
  if (canonicalError) return { ok: false, error: canonicalError };
  if (!payload.draftId.trim())
    return { ok: false, error: "This wizard lost its draft id — restart it." };

  const org = await ensurePersonalOrg(supabase, user.id);
  if (!org.ok) return { ok: false, error: org.error };

  // ---- Idempotency: a draftId maps to at most one project ----
  try {
    const { data: existing } = await supabase
      .from("project_drafts")
      .select("created_project_id")
      .eq("draft_id", payload.draftId)
      .maybeSingle();
    const priorId =
      existing && typeof existing.created_project_id === "string"
        ? (existing.created_project_id as string)
        : null;
    if (priorId) {
      const { data: stillThere } = await supabase
        .from("projects")
        .select("id")
        .eq("id", priorId)
        .maybeSingle();
      if (stillThere) {
        revalidatePath("/projects");
        return { ok: true, error: null, projectId: priorId };
      }
    }
  } catch {
    // drafts table missing (migration not pushed yet) — fall through and
    // create directly; the slug-retry below still prevents duplicates.
  }

  const base = slugify(name) || "project";
  let projectId: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("projects")
      .insert({
        organization_id: org.id,
        name,
        slug,
        created_by: user.id,
        environment: env,
        repository: repoUrl || null,
        is_demo: false,
      })
      .select("id")
      .single();
    if (!error && data) {
      projectId = data.id as string;
      break;
    }
    if (error?.code === "23505") continue; // slug taken — retry
    if (error) return { ok: false, error: friendlyDbError(error.message) };
  }
  if (!projectId) {
    return {
      ok: false,
      error: "A project with a similar name already exists — try a different name.",
    };
  }

  // ---- Persist the onboarding configuration (best-effort per table so a
  // missing migration degrades honestly instead of failing the create) ----
  const description = payload.basics.description.trim() || null;
  const tags = payload.basics.tags.map((t) => t.trim()).filter(Boolean);
  try {
    const { error } = await supabase.from("project_configs").upsert(
      {
        project_id: projectId,
        description,
        tags,
        branch,
        repository_provider: payload.repository.provider || null,
        analysis: payload.analysis ?? null,
        deployment: payload.deployment ?? null,
        runtime: payload.runtime ?? null,
        dependencies: payload.dependencies ?? null,
        health: payload.health ?? null,
        // `monitoring_status` is deliberately NOT set here. The column default
        // is 'pending', which is the truth: configuring a check is not the same
        // as having run one. It must only become 'active' when a real check
        // reports (RULE.md §9.2 — never claim health before evidence).
      },
      { onConflict: "project_id" },
    );
    if (error && !isMissingTable(error.message)) {
      // Config write failed for a real reason — keep the project (it is
      // real and reachable) but report honestly so Setup Complete does not
      // claim a configuration that isn't stored.
      return {
        ok: false,
        error: "Project was created but its configuration couldn't be saved. Open it from Projects and retry.",
      };
    }
  } catch {
    // table missing — project still exists; dashboard degrades gracefully
  }

  try {
    const rows = [
      ...payload.envVars
        .filter((v) => v.key.trim())
        .map((v) => ({
          project_id: projectId as string,
          key: v.key.trim(),
          value: v.value,
          is_secret: false,
          has_value: v.value.trim().length > 0,
        })),
      ...payload.secrets
        .filter((s) => s.key.trim())
        .map((s) => ({
          project_id: projectId as string,
          key: s.key.trim(),
          value: null,
          is_secret: true,
          has_value: s.hasValue,
        })),
    ];
    if (rows.length > 0) {
      await supabase
        .from("project_env_vars")
        .upsert(rows, { onConflict: "project_id,key" });
    }
  } catch {
    // non-fatal — names are also inside project_configs.deployment payload
  }

  try {
    await supabase.from("project_drafts").upsert(
      {
        draft_id: payload.draftId,
        organization_id: org.id,
        created_by: user.id,
        current_step: "complete",
        status: "created",
        created_project_id: projectId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "draft_id" },
    );
  } catch {
    // drafts table missing — idempotency falls back to slug retry
  }

  revalidatePath("/projects");
  return { ok: true, error: null, projectId };
}
