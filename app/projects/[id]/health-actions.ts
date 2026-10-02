"use server";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { revalidatePath } from "next/cache";
import { buildHealthCheckUrl } from "@/lib/onboarding/health";
import { loadProjectConfig } from "@/lib/project-config";
import { runMonitorTick } from "@/lib/detection/monitor";
import {
  classifyHttpStatus,
  classifyNoResponse,
  isBlockedAddress,
  isBlockedHostname,
} from "@/lib/monitoring/http-check";
import {
  activeIncidentOnService,
  authed,
  canSeeProject,
  type ActionResult,
} from "./incidents/actions";

/**
 * Run the project's CONFIGURED HTTP check once and record the observation.
 *
 * This is the action that turns onboarding configuration into real monitoring
 * evidence: it performs exactly the check Review describes (target URL +
 * endpoint path + expected status + timeout), stores the observation as a
 * `source='external'` health check, then runs one detection pass so the
 * detector — not the button — decides whether an incident opens, persists,
 * verifies, or resolves (OBSERVE → DETECT, never BUTTON → INCIDENT).
 *
 * Safety (repository input is untrusted, and so is any user-entered URL):
 * - only http/https targets, never with credentials (re-validated here, not
 *   just in the wizard);
 * - hostnames that are structurally internal are rejected without DNS;
 * - resolved addresses must all be public;
 * - redirects are not followed (a 3xx is an observation, not a rabbit hole);
 * - response bodies are never stored or logged — only status, latency, and
 *   the checked URL.
 */

const SERVICE_NAME = "Application endpoint";
const SERVICE_KIND = "http-endpoint";

async function resolvePublicHost(hostname: string): Promise<string | null> {
  if (isBlockedHostname(hostname)) return `Refusing to check internal target "${hostname}".`;
  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    return `Monitoring target "${hostname}" does not resolve.`;
  }
  if (records.length === 0) return `Monitoring target "${hostname}" does not resolve.`;
  for (const record of records) {
    if (isIP(record.address) === 0 || isBlockedAddress(record.address)) {
      return `Refusing to check non-public target "${hostname}".`;
    }
  }
  return null;
}

export async function runConfiguredHttpCheck(
  projectId: string,
): Promise<ActionResult> {
  const auth = await authed();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.ctx;

  if (!(await canSeeProject(supabase, projectId))) {
    return { ok: false, error: "Project not found." };
  }

  const { config } = await loadProjectConfig(projectId);
  const health = config?.health;
  if (!health || health.method !== "http") {
    return {
      ok: false,
      error: "This project has no HTTP health check configured. Set a target URL and endpoint path in onboarding first.",
    };
  }
  const built = buildHealthCheckUrl(health.targetUrl ?? "", health.endpoint ?? "");
  if (built.error || !built.url) {
    return { ok: false, error: built.error ?? "The stored health check target is incomplete." };
  }
  const expected = Number(health.expectedStatus ?? "200");
  if (!Number.isInteger(expected) || expected < 100 || expected > 599) {
    return { ok: false, error: "The stored expected status is invalid." };
  }
  const timeoutSec = Number(health.timeoutSec ?? "5");
  const timeoutMs =
    Number.isInteger(timeoutSec) && timeoutSec >= 1 && timeoutSec <= 120 ? timeoutSec * 1000 : 5000;

  let url: URL;
  try {
    url = new URL(built.url);
  } catch {
    return { ok: false, error: "The stored health check target is invalid." };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, error: "Refusing to check a target URL with credentials." };
  }
  const blocked = await resolvePublicHost(url.hostname);
  if (blocked) return { ok: false, error: blocked };

  // One canonical service per project for the configured check. Idempotent:
  // the unique (project_id, name) key means repeated runs reuse the row, and
  // the description always names the URL actually checked.
  const description = `Configured HTTP check: ${built.url}`;
  let serviceId: string | null = null;
  const { data: existing } = await supabase
    .from("services")
    .select("id, description")
    .eq("project_id", projectId)
    .eq("name", SERVICE_NAME)
    .maybeSingle();
  if (existing) {
    serviceId = existing.id as string;
    if ((existing as { description?: unknown }).description !== description) {
      await supabase.from("services").update({ description }).eq("id", serviceId);
    }
  } else {
    const { data: created, error } = await supabase
      .from("services")
      .insert({
        project_id: projectId,
        name: SERVICE_NAME,
        kind: SERVICE_KIND,
        status: null,
        description,
        is_demo: false,
      })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: "Couldn't set up the monitoring target service." };
    }
    serviceId = created.id as string;
  }

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let classification: ReturnType<typeof classifyHttpStatus>;
  let statusCode: number | null = null;
  try {
    const res = await fetch(built.url as string, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "User-Agent": "devops-safeguard-check/1.0" },
    });
    statusCode = res.status;
    // Drain nothing: the body is irrelevant and never stored.
    await res.arrayBuffer().catch(() => null);
    classification = classifyHttpStatus(res.status, expected);
  } catch (error) {
    classification =
      error instanceof Error && error.name === "AbortError"
        ? classifyNoResponse("timeout")
        : classifyNoResponse("network");
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - started;

  await supabase.from("service_health_checks").insert({
    project_id: projectId,
    service_id: serviceId,
    status: classification.status,
    source: "external",
    latency_ms: latencyMs,
    error_rate: classification.errorRate,
    detail: `GET ${built.url} → ${statusCode === null ? "no response" : `HTTP ${statusCode}`} in ${latencyMs}ms. ${classification.detail}.`,
    metadata: {
      target: health.targetUrl,
      path: health.endpoint,
      checked_url: built.url,
      status_code: statusCode,
      expected_status: expected,
    },
    is_demo: false,
    checked_at: new Date().toISOString(),
  });

  const tick = await runMonitorTick(supabase, projectId, userId);
  if (!tick.ok) {
    return { ok: false, error: "Detection pass failed. Check the database migration." };
  }
  const incidentId = await activeIncidentOnService(supabase, projectId, serviceId);
  revalidatePath(`/projects/${projectId}`);
  if (incidentId) revalidatePath(`/projects/${projectId}/incidents/${incidentId}`);

  const observed =
    statusCode === null ? "no response" : `HTTP ${statusCode}`;
  return {
    ok: true,
    incidentId: incidentId ?? undefined,
    message:
      tick.createdIncidents > 0
        ? `Check observed ${observed} — the detector opened an incident.`
        : tick.resolvedIncidents > 0
          ? `Check observed ${observed} — recovery verified, incident resolved.`
          : `Check observed ${observed} — no change.`,
  };
}
