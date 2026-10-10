/**
 * Runtime reading of the stored health configuration.
 *
 * `project_configs.health` is written once by the onboarding wizard and then
 * read by two very different callers: the signed-in "Run HTTP check" action
 * and the unattended monitoring worker. Both must agree on the SAME numbers,
 * otherwise the dashboard would describe one cadence while the worker runs
 * another.
 *
 * These helpers are the single runtime answer to "what does the stored
 * configuration actually mean?". They are deliberately narrow:
 *
 * - every numeric field falls back to the documented default when the stored
 *   value is missing or outside the wizard's validated bounds, exactly as the
 *   Phase 1 probe already did for `timeoutSec` (`5000ms`);
 * - nothing here performs I/O, so the rules are unit-tested directly;
 * - the bounds are imported from `lib/onboarding/validation.ts` rather than
 *   re-declared, so the wizard, the server boundary, and the scheduler can
 *   never drift into two different validation rules (RULE.md, "no second
 *   validation rule").
 */
import type { StoredHealth } from "../onboarding/stored-config";
import {
  HEALTH_FAILURE_THRESHOLD_MAX,
  HEALTH_FAILURE_THRESHOLD_MIN,
  HEALTH_INTERVAL_MAX_SEC,
  HEALTH_INTERVAL_MIN_SEC,
  HEALTH_TIMEOUT_MAX_SEC,
  HEALTH_TIMEOUT_MIN_SEC,
} from "../onboarding/validation";

/** Phase 1's documented fallbacks, reused rather than reinvented. */
export const DEFAULT_INTERVAL_SEC = 30;
export const DEFAULT_TIMEOUT_SEC = 5;
export const DEFAULT_FAILURE_THRESHOLD = 3;
export const DEFAULT_EXPECTED_STATUS = 200;

function boundedInt(
  raw: string | null | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Configured check cadence in seconds; always a valid, bounded integer. */
export function readIntervalSec(health: StoredHealth | null | undefined): number {
  return boundedInt(health?.intervalSec, HEALTH_INTERVAL_MIN_SEC, HEALTH_INTERVAL_MAX_SEC, DEFAULT_INTERVAL_SEC);
}

/** Configured request timeout in seconds; always a valid, bounded integer. */
export function readTimeoutSec(health: StoredHealth | null | undefined): number {
  return boundedInt(health?.timeoutSec, HEALTH_TIMEOUT_MIN_SEC, HEALTH_TIMEOUT_MAX_SEC, DEFAULT_TIMEOUT_SEC);
}

/**
 * Consecutive genuine failures required before an incident opens.
 *
 * This is the stored `failureThreshold` read at runtime for the first time
 * (Phase 1 displayed it but never applied it). Its meaning is unchanged: how
 * many consecutive real failed checks must be observed before detection acts.
 */
export function readFailureThreshold(health: StoredHealth | null | undefined): number {
  return boundedInt(
    health?.failureThreshold,
    HEALTH_FAILURE_THRESHOLD_MIN,
    HEALTH_FAILURE_THRESHOLD_MAX,
    DEFAULT_FAILURE_THRESHOLD,
  );
}

/** Configured expected HTTP status, or null when the stored value is unusable. */
export function readExpectedStatus(health: StoredHealth | null | undefined): number | null {
  const value = Number(health?.expectedStatus);
  if (!Number.isInteger(value) || value < 100 || value > 599) return null;
  return value;
}

/** True when onboarding stored an HTTP method — the only probed method. */
export function isHttpMethod(health: StoredHealth | null | undefined): boolean {
  return health?.method === "http";
}

/**
 * True when the stored configuration describes something the HTTP checker can
 * actually run: an HTTP method plus both halves of the target. An ineligible
 * project is skipped by the scheduler with a reason, never probed blindly.
 */
export function hasRunnableHttpConfig(health: StoredHealth | null | undefined): boolean {
  if (!isHttpMethod(health)) return false;
  return Boolean(health?.targetUrl && health?.endpoint);
}