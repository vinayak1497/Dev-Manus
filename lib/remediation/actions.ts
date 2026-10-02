/**
 * Remediation allowlist (acceptance §107 step 15).
 *
 * Remediation is a CLOSED, typed allowlist — there is deliberately no
 * EXECUTE_ARBITRARY_COMMAND and no path from an AI string to a shell. The AI
 * (or a human) may only ever propose one of these known action types; the
 * engine (./engine) knows how to apply each against demo/simulated state only.
 *
 * This module is pure metadata + guards so it can be unit tested and imported
 * by both the server engine and the deterministic AI provider.
 */

import type { RemediationRisk } from "../incidents";

export type RemediationActionType =
  | "RESTART_DEMO_SERVICE"
  | "RETRY_HEALTH_CHECK"
  | "ROLLBACK_DEMO_DEPLOYMENT";

export type RemediationSpec = {
  type: RemediationActionType;
  title: string;
  description: string;
  risk: RemediationRisk;
  /**
   * Whether applying this action is expected to restore the demo service to
   * health. RETRY_HEALTH_CHECK only re-probes, so it does NOT by itself fix a
   * real underlying failure — the UI must not imply it always will.
   */
  restoresHealth: boolean;
};

export const REMEDIATION_ALLOWLIST: Record<RemediationActionType, RemediationSpec> = {
  RESTART_DEMO_SERVICE: {
    type: "RESTART_DEMO_SERVICE",
    title: "Restart the affected demo service",
    description:
      "Restarts the simulated service and re-runs its health check. Acts only on demo/simulated state — never on real infrastructure.",
    risk: "low",
    restoresHealth: true,
  },
  RETRY_HEALTH_CHECK: {
    type: "RETRY_HEALTH_CHECK",
    title: "Re-run the health check",
    description:
      "Triggers an immediate health probe without changing the service, to confirm whether the failing condition is still present.",
    risk: "low",
    restoresHealth: false,
  },
  ROLLBACK_DEMO_DEPLOYMENT: {
    type: "ROLLBACK_DEMO_DEPLOYMENT",
    title: "Roll back to the previous demo deployment",
    description:
      "Reverts the simulated deployment marker to the last known-good version and re-checks. Acts only on demo deployment state.",
    risk: "medium",
    restoresHealth: true,
  },
};

export const REMEDIATION_ACTION_TYPES = Object.keys(
  REMEDIATION_ALLOWLIST,
) as RemediationActionType[];

export function isAllowedRemediation(
  value: unknown,
): value is RemediationActionType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(REMEDIATION_ALLOWLIST, value)
  );
}

/** Look up a spec, throwing if the type is not on the allowlist. */
export function requireRemediationSpec(value: unknown): RemediationSpec {
  if (!isAllowedRemediation(value)) {
    throw new Error(
      `Refusing remediation: "${String(
        value,
      )}" is not on the allowlist. Allowed: ${REMEDIATION_ACTION_TYPES.join(", ")}.`,
    );
  }
  return REMEDIATION_ALLOWLIST[value];
}
