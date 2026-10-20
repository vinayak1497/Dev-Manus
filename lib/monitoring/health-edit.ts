/**
 * Editable health monitoring — validation + persistence core.
 *
 * The dashboard could read the configuration onboarding stored, but there was
 * no way to change it: the only writer was the Add Project wizard. This module
 * is the server-side core behind the card's "Edit health monitoring" action.
 *
 * Split of responsibilities, deliberately:
 *
 * - **This module** validates and normalizes the submitted form with the SAME
 *   pure helpers the wizard uses (`normalizeHealthTarget`, `normalizeHealthPath`,
 *   `buildHealthCheckUrl`, the bounds from `lib/onboarding/validation.ts`),
 *   merges the result into the stored JSON without dropping unrelated keys,
 *   and decides whether the checked target actually changed.
 * - **`health-edit-supabase.ts`** is the thin Supabase adapter (RLS-scoped
 *   client, no service role).
 * - **`app/projects/[id]/health-actions.ts`** is the server action shell
 *   (session, revalidation).
 *
 * The IO is injected as {@link HealthEditBackend} so the authorization,
 * validation, preservation and failure paths are unit-tested directly, with no
 * database and no Next.js request context.
 *
 * WHAT A SAVE DOES *NOT* DO
 * -------------------------
 * - It never runs a probe. Saving is not evidence: until a real check runs, the
 *   dashboard must say "first check pending", never "healthy".
 * - It never writes a health observation.
 * - It never touches the private-target trust policy. A user may save a private
 *   URL; the worker still refuses it unless the operator has listed that exact
 *   host in `MONITOR_ALLOWED_PRIVATE_HOSTS`. Entering an IP grants nothing.
 */
import type { ServiceStatus } from "../incidents";
import { rollupHealth } from "../detection/health-rollup";
import {
  buildHealthCheckUrl,
  HEALTH_TARGET_TYPE_LABEL,
  normalizeHealthPath,
  normalizeHealthTarget,
} from "../onboarding/health";
import type { HealthTargetType } from "../onboarding/types";
import {
  HEALTH_EXPECTED_STATUS_VALUES,
  HEALTH_FAILURE_THRESHOLD_MAX,
  HEALTH_FAILURE_THRESHOLD_MIN,
  HEALTH_INTERVAL_MAX_SEC,
  HEALTH_INTERVAL_MIN_SEC,
  HEALTH_TIMEOUT_MAX_SEC,
  HEALTH_TIMEOUT_MIN_SEC,
} from "../onboarding/validation";

/** The monitoring methods the wizard can store. Only `http` is ever probed. */
export const HEALTH_METHODS = ["http", "port", "container"] as const;
export type HealthMethod = (typeof HEALTH_METHODS)[number];

/**
 * The form's raw values. Everything is a string because that is what an HTML
 * form, and therefore a server action payload, actually carries.
 */
export type HealthSettingsInput = {
  method: string;
  targetType: string;
  targetUrl: string;
  endpoint: string;
  expectedStatus: string;
  intervalSec: string;
  timeoutSec: string;
  failureThreshold: string;
};

export type HealthField = keyof HealthSettingsInput;
export type HealthFieldErrors = Partial<Record<HealthField, string>>;

/** The normalized values that are safe to persist. */
export type ValidatedHealthSettings = {
  method: HealthMethod;
  targetType: HealthTargetType;
  intervalSec: string;
  timeoutSec: string;
  failureThreshold: string;
  /**
   * Only present for `method: "http"`. For port/container checks these fields
   * are inert, so the stored values are left exactly as they were rather than
   * being overwritten with whatever a hidden input happened to contain.
   */
  targetUrl?: string;
  endpoint?: string;
  expectedStatus?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Validate the submitted settings against the SAME rules as onboarding.
 *
 * Returns per-field errors so the form can mark the exact input, rather than a
 * single banner that makes the user hunt for the bad value.
 */
export function validateHealthSettings(
  input: HealthSettingsInput,
): { ok: true; value: ValidatedHealthSettings } | { ok: false; fieldErrors: HealthFieldErrors } {
  const raw = (input ?? {}) as Partial<Record<HealthField, unknown>>;
  const errors: HealthFieldErrors = {};

  const methodRaw = asString(raw.method).trim();
  const methodOk = (HEALTH_METHODS as readonly string[]).includes(methodRaw);
  if (!methodOk) errors.method = "Choose a monitoring method.";

  const targetTypeRaw = asString(raw.targetType).trim();
  const targetTypeOk = Object.prototype.hasOwnProperty.call(
    HEALTH_TARGET_TYPE_LABEL,
    targetTypeRaw,
  );
  if (!targetTypeOk) errors.targetType = "Choose a target type.";

  const intervalSec = asString(raw.intervalSec).trim();
  const interval = Number(intervalSec);
  if (
    !Number.isInteger(interval) ||
    interval < HEALTH_INTERVAL_MIN_SEC ||
    interval > HEALTH_INTERVAL_MAX_SEC
  ) {
    errors.intervalSec = "Interval must be 10–3600 seconds.";
  }

  const timeoutSec = asString(raw.timeoutSec).trim();
  const timeout = Number(timeoutSec);
  if (
    !Number.isInteger(timeout) ||
    timeout < HEALTH_TIMEOUT_MIN_SEC ||
    timeout > HEALTH_TIMEOUT_MAX_SEC
  ) {
    errors.timeoutSec = "Timeout must be 1–120 seconds.";
  }

  const failureThreshold = asString(raw.failureThreshold).trim();
  const threshold = Number(failureThreshold);
  if (
    !Number.isInteger(threshold) ||
    threshold < HEALTH_FAILURE_THRESHOLD_MIN ||
    threshold > HEALTH_FAILURE_THRESHOLD_MAX
  ) {
    errors.failureThreshold = "Threshold must be 1–10.";
  }

  let targetUrl: string | undefined;
  let endpoint: string | undefined;
  let expectedStatus: string | undefined;

  if (methodRaw === "http") {
    const target = normalizeHealthTarget(asString(raw.targetUrl));
    if (target.error) {
      errors.targetUrl = target.error;
    } else if (!target.value) {
      errors.targetUrl = "Enter the monitoring target URL.";
    }

    const path = normalizeHealthPath(asString(raw.endpoint));
    if (path.error) {
      errors.endpoint = path.error;
    } else if (!path.value) {
      errors.endpoint = "Enter a health endpoint path, or switch method.";
    }

    const expected = asString(raw.expectedStatus).trim();
    if (!HEALTH_EXPECTED_STATUS_VALUES.includes(expected)) {
      errors.expectedStatus = "Use a common success code (e.g. 200).";
    }

    // The two halves are individually valid but can still fail to compose
    // (for example a target whose URL parser rejects the joined path).
    if (target.value && path.value && !errors.targetUrl && !errors.endpoint) {
      const built = buildHealthCheckUrl(target.value, path.value);
      if (built.error || !built.url) {
        errors.targetUrl =
          built.error ?? "That target URL and endpoint don't form a valid check URL.";
      }
    }

    targetUrl = target.value ?? undefined;
    endpoint = path.value ?? undefined;
    expectedStatus = expected || undefined;
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };

  return {
    ok: true,
    value: {
      method: methodRaw as HealthMethod,
      targetType: targetTypeRaw as HealthTargetType,
      intervalSec,
      timeoutSec,
      failureThreshold,
      ...(methodRaw === "http" ? { targetUrl, endpoint, expectedStatus } : {}),
    },
  };
}

/** The stored `health` JSONB as a plain object, without trusting its shape. */
export function asHealthRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Merge the validated settings into the stored object.
 *
 * Every key this module does not own — analysis provenance, future fields, a
 * hand-added note — is carried through untouched. That is the same guarantee
 * the database update gives at the column level: only `health` is written.
 */
export function mergeHealthSettings(
  previous: Record<string, unknown>,
  next: ValidatedHealthSettings,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...previous,
    method: next.method,
    targetType: next.targetType,
    intervalSec: next.intervalSec,
    timeoutSec: next.timeoutSec,
    failureThreshold: next.failureThreshold,
  };

  if (next.method === "http") {
    merged.targetUrl = next.targetUrl;
    merged.endpoint = next.endpoint;
    merged.expectedStatus = next.expectedStatus;

    // Provenance is a fact about how a value was obtained. Only claim
    // "configured" for a value the operator actually replaced.
    if (merged.targetUrl !== previous.targetUrl) {
      merged.targetProvenance = "configured";
    }
    if (merged.endpoint !== previous.endpoint) {
      merged.endpointProvenance = "configured";
    }
  }
  if (merged.method !== previous.method) {
    merged.methodProvenance = "configured";
  }

  return merged;
}

/**
 * Identity of the thing that gets probed.
 *
 * Interval, timeout and threshold are cadence/policy and do not invalidate the
 * last observation. The method, the exact checked URL and the expected status
 * do: once any of those change, the previous result says nothing about the
 * configuration that is now stored.
 */
export function healthProbeIdentity(health: Record<string, unknown>): string {
  const method = asString(health.method).trim();
  if (method !== "http") return `method:${method}`;
  const built = buildHealthCheckUrl(
    asString(health.targetUrl),
    asString(health.endpoint),
  );
  const expected = asString(health.expectedStatus).trim();
  return `http:${built.url ?? ""}:${expected}`;
}

// ===========================================================================
// Persistence core (IO injected)
// ===========================================================================

export type HealthEditBackendError = {
  message: string;
  code?: string;
};

export type HealthEditConfigRow = {
  health: unknown;
  monitoringStatus: unknown;
};

/** The minimal database surface the save path needs. All methods are RLS-scoped. */
export type HealthEditBackend = {
  /** The verified session's user id, or null when unauthenticated. */
  currentUserId(): Promise<string | null>;
  /** True only when RLS returns the project for this caller. */
  findProject(projectId: string): Promise<boolean>;
  readConfig(
    projectId: string,
  ): Promise<
    { ok: true; row: HealthEditConfigRow | null } | { ok: false; error: HealthEditBackendError }
  >;
  /** `updated` is false when RLS matched no row (a silent no-op must not pass). */
  updateConfig(
    projectId: string,
    patch: { health: Record<string, unknown>; monitoring_status?: "pending" },
  ): Promise<
    { ok: true; updated: boolean } | { ok: false; error: HealthEditBackendError }
  >;
  /**
   * Clear the canonical monitored service's scheduling/observation-derived
   * state so the old target's result is not presented as the new target's, and
   * re-label its description with `checkedUrl` so it never names a URL that is
   * no longer configured. Returns how many service rows were reset.
   */
  resetMonitoredService(
    projectId: string,
    checkedUrl: string | null,
  ): Promise<
    | { ok: true; reset: number }
    | { ok: false; error: HealthEditBackendError; schemaMissing?: boolean }
  >;
  readServiceStatuses(
    projectId: string,
  ): Promise<
    { ok: true; statuses: (string | null)[] } | { ok: false; error: HealthEditBackendError }
  >;
  updateProjectHealth(
    projectId: string,
    health: ServiceStatus | null,
  ): Promise<{ ok: true } | { ok: false; error: HealthEditBackendError }>;
};

export type HealthSaveResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: HealthFieldErrors;
  message?: string;
  /**
   * Saved, but something secondary could not be done (for example the Phase 2
   * migration is missing, so the previous check state could not be cleared).
   * Surfaced honestly instead of pretending the whole operation was clean.
   */
  warning?: string;
};

const SESSION_EXPIRED = "Your session has expired — please sign in again.";
const SERVICE_STATUSES: readonly ServiceStatus[] = [
  "healthy",
  "warning",
  "critical",
  "unknown",
  "maintenance",
  "recovering",
];

function toServiceStatus(value: string | null): ServiceStatus | null {
  return value !== null && (SERVICE_STATUSES as readonly string[]).includes(value)
    ? (value as ServiceStatus)
    : null;
}

/**
 * Save the health settings for one project.
 *
 * Order matters: authorize, validate, read, write, and only then clear the
 * stale check state. The caller must not report success unless the config write
 * actually updated a row.
 */
export async function saveHealthConfigurationCore(
  backend: HealthEditBackend,
  projectId: string,
  input: HealthSettingsInput,
): Promise<HealthSaveResult> {
  const userId = await backend.currentUserId();
  if (!userId) return { ok: false, error: SESSION_EXPIRED };

  if (typeof projectId !== "string" || projectId.trim() === "") {
    return { ok: false, error: "Project not found." };
  }

  // Access first: a caller must not learn whether their input is well-formed
  // for a project they cannot see.
  if (!(await backend.findProject(projectId))) {
    return { ok: false, error: "Project not found." };
  }

  // Validate before any read/write: a malformed target is never persisted and
  // never reaches the probe.
  const validated = validateHealthSettings(input);
  if (!validated.ok) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: validated.fieldErrors,
    };
  }

  const configResult = await backend.readConfig(projectId);
  if (!configResult.ok) {
    return {
      ok: false,
      error: "The stored configuration could not be read. Please retry.",
    };
  }
  if (!configResult.row) {
    return {
      ok: false,
      error:
        "This project has no stored configuration yet. Complete onboarding before editing health monitoring.",
    };
  }

  const previousHealth = asHealthRecord(configResult.row.health);
  const nextHealth = mergeHealthSettings(previousHealth, validated.value);
  const identityChanged =
    healthProbeIdentity(previousHealth) !== healthProbeIdentity(nextHealth);

  const patch: { health: Record<string, unknown>; monitoring_status?: "pending" } = {
    health: nextHealth,
  };
  // A changed probe target has not been checked yet. "pending" is the only
  // honest status until a real observation arrives; the check path itself
  // promotes it to "active" (lib/monitoring/external-check.ts).
  if (identityChanged) patch.monitoring_status = "pending";

  const write = await backend.updateConfig(projectId, patch);
  if (!write.ok) {
    return {
      ok: false,
      error: "The health configuration could not be saved. Please retry.",
    };
  }
  if (!write.updated) {
    // Mirrors the RLS warning in the migration: an update that matches no row
    // must never be reported as a saved configuration.
    return {
      ok: false,
      error:
        "The configuration was not saved — this project is no longer available to you.",
    };
  }

  let warning: string | undefined;

  if (identityChanged) {
    const nextCheckedUrl =
      validated.value.method === "http"
        ? buildHealthCheckUrl(
            String(nextHealth.targetUrl ?? ""),
            String(nextHealth.endpoint ?? ""),
          ).url
        : null;
    const reset = await backend.resetMonitoredService(projectId, nextCheckedUrl);
    if (!reset.ok) {
      warning = reset.schemaMissing
        ? "Saved, but the automatic-monitoring migration is not applied, so the previous check state could not be cleared. The dashboard may show the previous target's result until the next check."
        : "Saved, but the previous check state could not be cleared. The dashboard may show the previous target's result until the next check.";
    } else {
      // Keep the project badge truthful now rather than at the next tick: the
      // service we just cleared now counts as unknown, and any other service
      // keeps its real status.
      const statuses = await backend.readServiceStatuses(projectId);
      if (statuses.ok) {
        const rollup = rollupHealth(statuses.statuses.map(toServiceStatus));
        const updated = await backend.updateProjectHealth(projectId, rollup);
        if (!updated.ok) {
          warning =
            "Saved. The project health summary could not be refreshed; it will update on the next monitoring pass.";
        }
      } else {
        warning =
          "Saved. The project health summary could not be refreshed; it will update on the next monitoring pass.";
      }
    }
  }

  return {
    ok: true,
    message: identityChanged
      ? "Health monitoring saved. The new target has not been checked yet — the next scheduled check will produce the first result."
      : "Health monitoring saved. The next scheduled check will use the new timings.",
    warning,
  };
}
