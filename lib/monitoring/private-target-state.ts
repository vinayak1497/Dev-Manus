/**
 * The dashboard's read-back state for a private monitoring target.
 *
 * The worker owns the allowlist and never exposes it to the browser. The
 * dashboard can only report what the worker persisted:
 *
 * - a matching healthy observation ("checked"),
 * - a worker refusal ("refused"),
 * - another failed attempt ("failed"), or
 * - no evidence for the current configuration yet ("unverified").
 *
 * A previous check is never treated as proof that the host is CURRENTLY
 * allowlisted. A successful check is reported as "checked", not "trusted";
 * the operator policy remains the only authorization path.
 *
 * Pure so the four states are unit-tested instead of inferred in JSX.
 */
import type { AutomaticMonitoringView } from "./automatic-state";

export type PrivateTargetState =
  | { kind: "unverified"; host: string }
  | {
      kind: "checked";
      host: string;
      detail: string;
      statusCode: number | null;
    }
  | { kind: "refused"; host: string; error: string }
  | {
      kind: "failed";
      host: string;
      detail: string | null;
      error: string | null;
      status: string | null;
    };

/**
 * The three worker messages that mean "the SSRF gate refused this private
 * target". Deliberately not a bare "Refusing to check" prefix: the credential
 * refusal is a different problem and should not be presented as an allowlist
 * issue.
 */
const PRIVATE_TARGET_REFUSAL =
  /^Refusing to check (?:internal target|non-public target|".+" under the trusted-target policy)/;

export function isPrivateTargetRefusal(
  message: string | null | undefined,
): boolean {
  return typeof message === "string" && PRIVATE_TARGET_REFUSAL.test(message);
}

export function derivePrivateTargetState(
  host: string,
  automatic: AutomaticMonitoringView | undefined,
): PrivateTargetState {
  if (!automatic) return { kind: "unverified", host };

  const lastError = automatic.lastError;
  if (lastError !== null && isPrivateTargetRefusal(lastError)) {
    return { kind: "refused", host, error: lastError };
  }

  // `lastDetail` is populated only when the newest persisted external
  // observation matches the current checked URL AND expected status. It is
  // evidence that a check ran against THIS configuration; it is not proof of
  // the worker's current allowlist.
  if (automatic.lastDetail !== null) {
    if (automatic.lastStatus === "healthy") {
      return {
        kind: "checked",
        host,
        detail: automatic.lastDetail,
        statusCode: automatic.lastStatusCode,
      };
    }
    return {
      kind: "failed",
      host,
      detail: automatic.lastDetail,
      error: lastError,
      status: automatic.lastStatus,
    };
  }

  if (lastError !== null) {
    return {
      kind: "failed",
      host,
      detail: null,
      error: lastError,
      status: automatic.lastStatus,
    };
  }

  return { kind: "unverified", host };
}
