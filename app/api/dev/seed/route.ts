import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEMO_ORG_NAME, DEMO_PROJECTS } from "@/lib/projects/demo-data";

/**
 * Development-only seeding of sample projects for demos and UI review.
 *
 *   POST   /api/dev/seed   create org + membership + sample projects
 *   DELETE /api/dev/seed   remove the sample projects it created
 *
 * Safety (RULE.md §11):
 *   - hard-blocked when NODE_ENV === "production" (404, not 403, so the
 *     route is not even discoverable)
 *   - requires a real Supabase session; the anon key is used, so RLS
 *     still scopes every read and write to the caller's own organization
 *   - writes are idempotent: re-running adds nothing
 *
 * Rows are written with `is_demo = true` so the UI labels them as sample
 * data rather than telemetry (RULE.md §9.1).
 */
export const dynamic = "force-dynamic";

function notAvailable() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404 },
  );
}

type SeedResponse = {
  ok: boolean;
  message: string;
  created?: number;
  organizationId?: string;
  details?: string[];
};

export async function POST() {
  if (process.env.NODE_ENV === "production") return notAvailable();

  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return NextResponse.json<SeedResponse>(
      {
        ok: false,
        message:
          "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
      },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json<SeedResponse>(
      { ok: false, message: "Sign in first — seeding is per-account." },
      { status: 401 },
    );
  }

  // Tables missing means migrations were never pushed. Say so plainly
  // rather than emitting a generic failure.
  const { error: probeError } = await supabase
    .from("projects")
    .select("id")
    .limit(1);
  if (probeError) {
    return NextResponse.json<SeedResponse>(
      {
        ok: false,
        message:
          "The database schema isn't installed yet. Run `supabase link` then `supabase db push`.",
        details: [probeError.message],
      },
      { status: 503 },
    );
  }

  const details: string[] = [];
  const now = Date.now();

  // Idempotency: if this account already has projects, there is nothing to do.
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json<SeedResponse>({
      ok: true,
      message:
        "This account already has projects — nothing was added. Use DELETE /api/dev/seed to clear the sample data first.",
      created: 0,
    });
  }

  // Reuse the org from a previous run when RLS lets us see it; otherwise
  // create one and enrol ourselves in it.
  const { data: ownedOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("created_by", user.id)
    .limit(1)
    .maybeSingle();

  let organizationId = ownedOrg?.id as string | undefined;

  if (!organizationId) {
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: DEMO_ORG_NAME, created_by: user.id })
      .select("id")
      .single();

    if (orgError) {
      return NextResponse.json<SeedResponse>(
        {
          ok: false,
          message: "Could not create the demo organization.",
          details: [orgError.message],
        },
        { status: 500 },
      );
    }
    organizationId = org.id as string;

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: organizationId,
        user_id: user.id,
        role: "owner",
      });

    if (memberError) {
      return NextResponse.json<SeedResponse>(
        {
          ok: false,
          message:
            "Organization created, but enrolment failed. Run `supabase db push` — the 20260930000000 migration adds the missing INSERT policy.",
          details: [memberError.message],
        },
        { status: 500 },
      );
    }
    details.push("Created organization and enrolled you as owner.");
  }

  const rows = DEMO_PROJECTS.map((seed) => ({
    organization_id: organizationId,
    name: seed.name,
    slug: seed.slug,
    created_by: user.id,
    created_at: new Date(now - seed.createdDaysAgo * 86_400_000).toISOString(),
    environment: seed.environment,
    repository: seed.repository,
    health: seed.health,
    service_count: seed.serviceCount,
    active_incident_count: seed.activeIncidentCount,
    last_checked_at: new Date(now - seed.checkedSecondsAgo * 1000).toISOString(),
    health_warning: seed.healthWarning,
    deployment_version: seed.deploymentVersion,
    deployment_commit: seed.deploymentCommit,
    deployment_status: seed.deploymentStatus,
    deployed_at:
      seed.deployedMinutesAgo === null
        ? null
        : new Date(now - seed.deployedMinutesAgo * 60_000).toISOString(),
    is_demo: true,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("projects")
    .insert(rows)
    .select("id");

  if (insertError) {
    return NextResponse.json<SeedResponse>(
      {
        ok: false,
        message:
          "Organization is ready, but the sample projects could not be inserted. Run `supabase db push` to add the telemetry columns.",
        details: [insertError.message],
      },
      { status: 500 },
    );
  }

  return NextResponse.json<SeedResponse>({
    ok: true,
    message: `Seeded ${inserted?.length ?? 0} sample projects. Reload /projects to see them.`,
    created: inserted?.length ?? 0,
    organizationId,
    details,
  });
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") return notAvailable();

  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return NextResponse.json<SeedResponse>(
      { ok: false, message: "Supabase isn't configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json<SeedResponse>(
      { ok: false, message: "Sign in first." },
      { status: 401 },
    );
  }

  // RLS scopes the delete to organizations this account belongs to.
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("is_demo", true)
    .select("id");

  if (error) {
    return NextResponse.json<SeedResponse>(
      {
        ok: false,
        message: "Could not remove the sample projects.",
        details: [error.message],
      },
      { status: 500 },
    );
  }

  return NextResponse.json<SeedResponse>({
    ok: true,
    message: `Removed ${data?.length ?? 0} sample projects. Your real projects were not touched.`,
    created: 0,
  });
}
