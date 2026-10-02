/**
 * Per-step validation for the onboarding wizard.
 * Pure functions — safe to unit-test, no I/O.
 */
import type { WizardState } from "./types";
import { normalizeHealthPath, normalizeHealthTarget } from "./health";

export type StepErrors = Record<string, string>;

const NAME_MAX = 80;
const DESC_MAX = 280;
const TAG_MAX = 24;
const URL_MAX = 200;
const VAR_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The one rule for environment-variable / secret names.
 * Exported so the `.env` importer validates imported names identically to
 * manually entered ones (no second, drifting rule).
 */
export function isValidEnvVarKey(key: string): boolean {
  return VAR_KEY.test(key.trim());
}

export function validateBasics(s: WizardState): StepErrors {
  const e: StepErrors = {};
  const name = s.basics.name.trim();
  if (!name) e.name = "Enter a project name.";
  else if (name.length > NAME_MAX) e.name = `Keep the name under ${NAME_MAX} characters.`;
  if (s.basics.description.trim().length > DESC_MAX)
    e.description = `Keep the description under ${DESC_MAX} characters.`;
  if (s.basics.tags.length > 8) e.tags = "Keep to 8 tags or fewer.";
  for (const t of s.basics.tags) {
    if (t.length > TAG_MAX) {
      e.tags = `Keep each tag under ${TAG_MAX} characters.`;
      break;
    }
  }
  if (!s.basics.environment) e.environment = "Choose an environment.";
  return e;
}

function parseRepoUrl(url: string): {
  provider: "github" | "other";
  owner: string | null;
  repo: string | null;
  ok: boolean;
} {
  const t = url.trim();
  const m = /github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[#?/].*)?$/i.exec(t);
  if (m) return { provider: "github", owner: m[1], repo: m[2], ok: true };
  if (!t) return { provider: "other", owner: null, repo: null, ok: false };
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (!u.hostname.includes(".")) throw new Error("bad host");
    return { provider: "other", owner: null, repo: null, ok: true };
  } catch {
    return { provider: "other", owner: null, repo: null, ok: false };
  }
}

export function validateRepository(s: WizardState): StepErrors {
  const e: StepErrors = {};
  const url = s.repository.url.trim();
  // Empty is allowed — the user may continue without a repository and
  // configure everything manually (later steps adapt).
  if (!url) return e;
  if (url.length > URL_MAX) e.url = `Keep the URL under ${URL_MAX} characters.`;
  else if (!parseRepoUrl(url).ok) e.url = "That URL doesn't look valid.";
  if (s.repository.branch.trim().length > 100)
    e.branch = "Keep the branch under 100 characters.";
  return e;
}

/** Repository step is skippable (manual configuration remains available). */
export function repositoryHasUrl(s: WizardState): boolean {
  return s.repository.url.trim().length > 0;
}

export function validateDeployment(s: WizardState): StepErrors {
  const e: StepErrors = {};
  if (!s.deployment.strategy) e.strategy = "Choose how to deploy, or pick “No deployment config yet”.";
  return e;
}

export function validateEnvironment(s: WizardState): StepErrors {
  const e: StepErrors = {};
  const seen = new Set<string>();
  for (const v of s.environment.vars) {
    if (!v.key.trim() && !v.value.trim()) continue;
    if (!isValidEnvVarKey(v.key.trim())) {
      e.vars = `“${v.key || "(empty)"}” isn't a valid variable name (A–Z, 0–9, underscore).`;
      break;
    }
    const k = v.key.trim();
    if (seen.has(k)) {
      e.vars = `Duplicate variable “${k}”.`;
      break;
    }
    seen.add(k);
  }
  const seenS = new Set<string>();
  for (const sec of s.environment.secrets) {
    if (!sec.key.trim()) {
      e.secrets = "Secret names can't be empty.";
      break;
    }
    if (!isValidEnvVarKey(sec.key.trim())) {
      e.secrets = `“${sec.key}” isn't a valid secret name.`;
      break;
    }
    if (seenS.has(sec.key.trim())) {
      e.secrets = `Duplicate secret “${sec.key.trim()}”.`;
      break;
    }
    seenS.add(sec.key.trim());
  }
  return e;
}

export function validateRuntime(s: WizardState): StepErrors {
  const e: StepErrors = {};
  const start = s.runtime.startCommand.trim();
  // Kubernetes and Helm start the workload from the deployment itself, so an
  // empty production command there means "deployment-managed", not missing.
  // Every other deployment still needs an explicit start command.
  if (!start && s.deployment.strategy !== "kubernetes" && s.deployment.strategy !== "helm") {
    e.startCommand = "Enter a start command.";
  }
  if (start) {
    const language = s.analysis?.language.value ?? s.runtime.runtime;
    if (language && language !== "Node.js" && /\b(npm|yarn|pnpm|bun)\b/i.test(start)) {
      e.startCommand = `That ${language} command uses a JavaScript package manager. Enter the deployed workload's actual start command.`;
    }
    if (/\b(npm run dev|yarn dev|pnpm dev|go run)\b/i.test(start) && (s.deployment.strategy === "kubernetes" || s.deployment.strategy === "helm")) {
      e.startCommand = "Use the deployed workload's production start command, not a development command.";
    }
  }
  const port = s.runtime.port.trim();
  if (port) {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535)
      e.port = "Port must be 1–65535.";
  }
  return e;
}

export function validateDependencies(_s: WizardState): StepErrors {
  // Everything here is optional — unknown is an honest answer.
  return {};
}

export function validateHealth(s: WizardState): StepErrors {
  const e: StepErrors = {};
  if (s.health.method === "http") {
    const target = normalizeHealthTarget(s.health.targetUrl);
    if (target.error) e.targetUrl = target.error;
    else if (!target.value) e.targetUrl = "Enter the monitoring target URL.";
    const endpoint = normalizeHealthPath(s.health.endpoint);
    if (endpoint.error) e.endpoint = endpoint.error;
    else if (!endpoint.value) e.endpoint = "Enter a health endpoint path, or switch method.";
  }
  const int = Number(s.health.intervalSec);
  if (!Number.isInteger(int) || int < 10 || int > 3600)
    e.intervalSec = "Interval must be 10–3600 seconds.";
  const to = Number(s.health.timeoutSec);
  if (!Number.isInteger(to) || to < 1 || to > 120)
    e.timeoutSec = "Timeout must be 1–120 seconds.";
  const ft = Number(s.health.failureThreshold);
  if (!Number.isInteger(ft) || ft < 1 || ft > 10)
    e.failureThreshold = "Threshold must be 1–10.";
  if (!["200", "201", "202", "204", "301", "302"].includes(s.health.expectedStatus.trim()))
    e.expectedStatus = "Use a common success code (e.g. 200).";
  return e;
}

export function validateStep(
  step: WizardState["currentStep"],
  s: WizardState,
): StepErrors {
  switch (step) {
    case "basics":
      return validateBasics(s);
    case "repository":
      return validateRepository(s);
    case "deployment":
      return validateDeployment(s);
    case "environment":
      return validateEnvironment(s);
    case "runtime":
      return validateRuntime(s);
    case "health":
      return validateHealth(s);
    default:
      return {};
  }
}

export { parseRepoUrl };

/**
 * Server/client boundary validation for the canonical persisted sections.
 * This mirrors the wizard checks without trusting client-side validation.
 */
export function validateOnboardingPayload(payload: {
  deployment: { strategy: string };
  runtime: { startCommand: string; port: string };
  health: { method: string; targetUrl: string; endpoint: string; intervalSec: string; timeoutSec: string; failureThreshold: string; expectedStatus: string };
  language: string | null;
}): string | null {
  if (!payload.deployment.strategy) return "Choose a deployment configuration.";
  const start = payload.runtime.startCommand.trim();
  if (!start && payload.deployment.strategy !== "kubernetes" && payload.deployment.strategy !== "helm") {
    return "Enter a start command.";
  }
  if (start && payload.language && payload.language !== "Node.js" && /\b(npm|yarn|pnpm|bun)\b/i.test(start)) {
    return `That ${payload.language} command uses a JavaScript package manager.`;
  }
  const portRaw = payload.runtime.port.trim();
  if (portRaw) {
    const port = Number(portRaw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return "Port must be 1–65535.";
  }
  if (payload.health.method === "http") {
    const target = normalizeHealthTarget(payload.health.targetUrl);
    if (target.error || !target.value) return target.error ?? "Enter the monitoring target URL.";
    const endpoint = normalizeHealthPath(payload.health.endpoint);
    if (endpoint.error || !endpoint.value) return endpoint.error ?? "Enter a health endpoint path.";
  }
  const interval = Number(payload.health.intervalSec);
  const timeout = Number(payload.health.timeoutSec);
  const threshold = Number(payload.health.failureThreshold);
  if (!Number.isInteger(interval) || interval < 10 || interval > 3600) return "Check interval must be 10–3600 seconds.";
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120) return "Timeout must be 1–120 seconds.";
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 10) return "Failure threshold must be 1–10.";
  if (!["200", "201", "202", "204", "301", "302"].includes(payload.health.expectedStatus.trim())) {
    return "Use a common success code (e.g. 200).";
  }
  return null;
}
