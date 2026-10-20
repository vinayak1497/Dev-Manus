/**
 * Real machine-readable export of one incident (§19). This is a genuine route
 * handler — not a fabricated "download" button — that streams the same bundle
 * the report page renders, as JSON with an attachment disposition.
 *
 * Authorization: the client is the RLS-scoped anon client and we re-verify the
 * caller with auth.getUser(). A project/incident id in the URL is never enough
 * on its own — RLS scopes every read, and we assert project ownership in the
 * loader, so a mismatched or foreign id returns 404, never another tenant's
 * data. The AI interpretation is nested under a clearly-labelled key and kept
 * separate from observed facts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadIncidentBundle } from "@/lib/incidents/load";
import { LIFECYCLE_PHASE_LABEL } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; incidentId: string }> },
) {
  const { id, incidentId } = await params;
  const supabase = await createClient().catch(() => null);
  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication is not configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const result = await loadIncidentBundle(supabase, id, incidentId);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Incident not found." }, { status: 404 });
    }
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  const { bundle } = result;
  const { incident } = bundle;

  // Observed facts are kept strictly separate from AI interpretation (§19).
  const payload = {
    exportedAt: new Date().toISOString(),
    schema: "devops-safeguard.incident-report/v1",
    isDemo: incident.isDemo,
    project: bundle.project,
    incident: {
      id: incident.id,
      title: incident.title,
      summary: incident.summary,
      severity: incident.severity,
      status: incident.status,
      lifecyclePhase: bundle.phase,
      lifecyclePhaseLabel: LIFECYCLE_PHASE_LABEL[bundle.phase],
      detectedAt: incident.detectedAt,
      resolvedAt: incident.resolvedAt,
      service: bundle.service,
    },
    observed: {
      note: "Recorded facts — telemetry, logs, and events. Not AI-generated.",
      evidence: bundle.evidence,
      relatedChanges: bundle.relatedChanges,
      healthChecks: bundle.checks,
      timeline: bundle.events,
    },
    aiInterpretation: bundle.analysis
      ? {
          note: "AI-generated interpretation — not verified fact. Review the observed evidence before acting.",
          analysis: bundle.analysis,
        }
      : null,
    remediations: bundle.remediations,
    verifications: bundle.verifications,
  };

  const filename = `incident-${incident.id}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
