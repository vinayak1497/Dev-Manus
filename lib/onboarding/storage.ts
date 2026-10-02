/**
 * Wizard draft survival across refresh/navigation.
 *
 * localStorage holds the in-progress wizard (versioned key). Secret VALUES
 * are stripped before every write — only secret names + presence survive a
 * refresh. Values stay in memory for the session.
 */
import { emptyWizardState, type WizardState } from "./types";

const KEY = "dsg-onboarding-draft-v2";
const SECRET_VALUES_KEY = "dsg-onboarding-secret-values-v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function saveDraft(state: WizardState): void {
  if (!isBrowser()) return;
  try {
    const stripped: WizardState = {
      ...state,
      environment: {
        vars: state.environment.vars,
        secrets: state.environment.secrets.map((s) => ({
          key: s.key,
          hasValue: s.hasValue,
        })),
      },
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(stripped));
  } catch {
    // Storage full/blocked — the wizard still works in memory.
  }
}

export function loadDraft(): WizardState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    if (!parsed || typeof parsed !== "object") return null;
    const base = emptyWizardState(
      typeof parsed.draftId === "string" ? parsed.draftId : undefined,
    );
    // Never trust stored shapes — merge onto the empty state.
    return {
      ...base,
      ...parsed,
      basics: { ...base.basics, ...(parsed.basics ?? {}) },
      repository: { ...base.repository, ...(parsed.repository ?? {}) },
      deployment: { strategy: "", useDetected: true, notes: "", ...(parsed.deployment ?? {}) },
      environment: {
        vars: Array.isArray(parsed.environment?.vars)
          ? parsed.environment.vars
          : [],
        secrets: Array.isArray(parsed.environment?.secrets)
          ? parsed.environment.secrets
          : [],
      },
      runtime: { ...base.runtime, ...(parsed.runtime ?? {}) },
      dependencies: { ...base.dependencies, ...(parsed.dependencies ?? {}) },
      health: {
        method: "http",
        targetType: "unknown",
        targetUrl: "",
        endpoint: "",
        expectedStatus: "200",
        intervalSec: "30",
        timeoutSec: "5",
        failureThreshold: "3",
        methodProvenance: "not_detected",
        targetProvenance: "not_detected",
        endpointProvenance: "not_detected",
        ...(parsed.health ?? {}),
      },
    } as WizardState;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(KEY);
    window.sessionStorage.removeItem(SECRET_VALUES_KEY);
  } catch {
    // ignore
  }
}

/** Session-only secret values (never localStorage, never logged). */
export function saveSecretValues(values: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SECRET_VALUES_KEY, JSON.stringify(values));
  } catch {
    // ignore
  }
}

export function loadSecretValues(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(SECRET_VALUES_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as Record<string, string>;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
