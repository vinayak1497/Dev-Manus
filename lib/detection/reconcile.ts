/**
 * Detection reconcile core (acceptance §107 steps 8-10, §21).
 *
 * This is deliberately a PURE function: given what a monitor observed for one
 * service and the incident/verification state that already exists, it decides
 * what should change. It performs no IO, so the detection rules — create,
 * deduplicate, begin/advance/reset verification, confirm recovery — are unit
 * tested directly, and the same rules run in the live IO shell (./monitor).
 *
 * The architecture this enforces is OBSERVE -> DETECT, never BUTTON -> INCIDENT:
 * the controlled-failure simulation only writes observed health checks; this
 * function is what independently turns a sustained unhealthy signal into an
 * incident, and a sustained healthy signal into a confirmed recovery.
 */

import type {
  IncidentSeverity,
  IncidentStatus,
  ServiceStatus,
} from "../incidents";

/** A "bad" reading — worth opening or sustaining an incident. */
export function isUnhealthyStatus(status: ServiceStatus): boolean {
  return status === "critical" || status === "warning";
}

/** A confirmed-good reading — the only thing that advances verification. */
export function isHealthyStatus(status: ServiceStatus): boolean {
  return status === "healthy";
}

/** Incident severity implied by an observed service status. */
export function severityForStatus(status: ServiceStatus): IncidentSeverity {
  if (status === "critical") return "critical";
  if (status === "warning") return "medium";
  return "low";
}

export type ActiveIncidentView = {
  id: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
};

export type ActiveVerificationView = {
  id: string;
  status: "running" | "passed" | "failed" | "cancelled";
  checksRequired: number;
  checksPassed: number;
};

export type ReconcileInput = {
  service: { id: string; name: string; currentStatus: ServiceStatus | null };
  /** Most recent observed check; null means nothing has been observed yet. */
  observedStatus: ServiceStatus | null;
  activeIncident: ActiveIncidentView | null;
  activeVerification: ActiveVerificationView | null;
  /**
   * Consecutive genuine failures and the configured threshold, supplied by
   * the caller for a REAL external check.
   *
   * This is the stored `failureThreshold` finally being applied at runtime.
   * It is deliberately an INPUT, not something this module looks up: the
   * detection core stays pure and keeps no state of its own, and a caller
   * that is not gating genuine external failures (demo setup, a controlled
   * simulation, a plain manual monitor tick) simply omits it and gets the
   * original "first bad reading opens an incident" behaviour unchanged.
   */
  failureGate?: FailureGate | null;
};

/**
 * The configured "alert after N consecutive failures" policy for one service.
 * `consecutiveFailures` counts only genuine external observations
 * (`source='external'`, `is_demo=false`) — see lib/monitoring/failure-streak.ts.
 */
export type FailureGate = {
  consecutiveFailures: number;
  threshold: number;
};

export type ReconcileAction =
  | { type: "none" }
  | {
      type: "open_incident";
      severity: IncidentSeverity;
      title: string;
      observedStatus: ServiceStatus;
    }
  | { type: "record_ongoing"; observedStatus: ServiceStatus }
  | {
      /**
       * A genuine failure was observed and recorded, but the configured
       * consecutive-failure threshold has not been reached yet. The service
       * status still becomes the real observed status — hiding a real failure
       * behind a "still healthy" badge would be the dishonest option
       * (RULE.md 9.1/9.2) — only the incident decision waits.
       */
      type: "below_threshold";
      observedStatus: ServiceStatus;
      consecutiveFailures: number;
      threshold: number;
    }
  | { type: "begin_verification"; checksRequired: number }
  | { type: "advance_verification"; checksPassed: number; checksRequired: number }
  | { type: "reset_verification"; observedStatus: ServiceStatus }
  | { type: "confirm_recovery" };

export type ReconcileResult = {
  /** What services.status should be set to (the observed reading is truth). */
  serviceStatus: ServiceStatus;
  action: ReconcileAction;
};

/** Number of consecutive healthy checks required to confirm a recovery. */
export const DEFAULT_VERIFICATION_CHECKS = 3;

function titleForStatus(name: string, status: ServiceStatus): string {
  if (status === "critical") return `${name} is failing health checks`;
  if (status === "warning") return `${name} is degraded`;
  return `${name} needs attention`;
}

/**
 * Decide the single next step for one service. Total and deterministic.
 */
export function reconcileService(input: ReconcileInput): ReconcileResult {
  const observed: ServiceStatus =
    input.observedStatus ?? input.service.currentStatus ?? "unknown";

  // No incident yet: a bad reading opens one (dedup handled by caller passing
  // activeIncident when one already exists); anything else is a no-op.
  if (!input.activeIncident) {
    if (isUnhealthyStatus(observed)) {
      // Applied threshold: the configured number of CONSECUTIVE genuine
      // failures must be reached before an incident opens. Below it, the
      // failure is still recorded and the service status still reflects it;
      // only the incident decision waits. The gate never applies once an
      // incident is open, so a flapping target can never open a second one.
      const gate = input.failureGate;
      if (gate && gate.consecutiveFailures < gate.threshold) {
        return {
          serviceStatus: observed,
          action: {
            type: "below_threshold",
            observedStatus: observed,
            consecutiveFailures: gate.consecutiveFailures,
            threshold: gate.threshold,
          },
        };
      }
      return {
        serviceStatus: observed,
        action: {
          type: "open_incident",
          severity: severityForStatus(observed),
          title: titleForStatus(input.service.name, observed),
          observedStatus: observed,
        },
      };
    }
    return { serviceStatus: observed, action: { type: "none" } };
  }

  // An incident is already active for this service.
  const verifying =
    input.activeVerification && input.activeVerification.status === "running"
      ? input.activeVerification
      : null;

  if (verifying) {
    if (isHealthyStatus(observed)) {
      const next = verifying.checksPassed + 1;
      if (next >= verifying.checksRequired) {
        return { serviceStatus: "healthy", action: { type: "confirm_recovery" } };
      }
      return {
        serviceStatus: "recovering",
        action: {
          type: "advance_verification",
          checksPassed: next,
          checksRequired: verifying.checksRequired,
        },
      };
    }
    if (isUnhealthyStatus(observed)) {
      // Recovery not sustained — reset progress, do NOT resolve (§17).
      return {
        serviceStatus: observed,
        action: { type: "reset_verification", observedStatus: observed },
      };
    }
    // recovering / unknown / maintenance: hold, neither advance nor reset.
    return { serviceStatus: observed, action: { type: "none" } };
  }

  // Incident active, no verification running yet.
  if (isUnhealthyStatus(observed)) {
    // Deduplicate: keep the single active incident, just record it persists.
    return {
      serviceStatus: observed,
      action: { type: "record_ongoing", observedStatus: observed },
    };
  }
  if (isHealthyStatus(observed)) {
    // Health returned (via remediation or on its own) — start confirming it.
    return {
      serviceStatus: "recovering",
      action: {
        type: "begin_verification",
        checksRequired: DEFAULT_VERIFICATION_CHECKS,
      },
    };
  }
  return { serviceStatus: observed, action: { type: "none" } };
}
