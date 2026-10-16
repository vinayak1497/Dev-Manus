/**
 * Worker configuration — read once at startup, validated, then immutable.
 *
 * A monitoring worker that starts with a half-configured environment is worse
 * than one that refuses to start: it looks alive, logs nothing alarming, and
 * silently monitors nothing. So every value is validated here and the process
 * exits non-zero with a precise, actionable list of problems instead.
 *
 * The function is pure (it takes an environment object) so the validation
 * rules themselves are unit-tested — startup behaviour is a contract, not an
 * untestable side effect.
 *
 * Secret safety: this module never returns, logs or echoes a key. It reports
 * only WHETHER a credential was found.
 */
import { hostname } from "node:os";
import type { LogLevel } from "./worker-log";
import {
  parseTrustedPrivateHosts,
  TRUSTED_PRIVATE_HOSTS_ENV,
} from "./trusted-targets";

export type WorkerEnvironment = Record<string, string | undefined>;

export type WorkerConfig = {
  supabaseUrl: string;
  /** Present, but never logged or returned to a caller that could print it. */
  serviceRoleKey: string;
  workerId: string;
  pollSeconds: number;
  concurrency: number;
  batchLimit: number;
  leaseSeconds: number;
  /** Restrict to one project — for a controlled single-project run. */
  projectId: string | null;
  logLevel: LogLevel;
  /** One pass and exit, instead of running forever. */
  once: boolean;
  enabled: boolean;
  /**
   * Exact hosts/IPs excused from the private-address refusal
   * (`MONITOR_ALLOWED_PRIVATE_HOSTS`). Empty means default-deny, exactly as
   * before. Operator configuration only — never user-supplied.
   */
  trustedPrivateHosts: string[];
  /** Informational build marker for deploy correspondence checks (may be null). */
  buildSha: string | null;
};

export type WorkerConfigResult =
  | { ok: true; config: WorkerConfig; warnings: string[] }
  | { ok: false; errors: string[] };

const DEFAULTS = {
  pollSeconds: 10,
  concurrency: 4,
  batchLimit: 200,
  leaseSeconds: 120,
} as const;

/** The smallest configured service interval the wizard accepts. */
const MIN_SERVICE_INTERVAL_SEC = 10;

function readInt(
  env: WorkerEnvironment,
  key: string,
  fallback: number,
  min: number,
  max: number,
  errors: string[],
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${key} must be a whole number between ${min} and ${max} (got "${raw}").`);
    return fallback;
  }
  return value;
}

function readBool(env: WorkerEnvironment, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readLogLevel(env: WorkerEnvironment, warnings: string[]): LogLevel {
  const raw = env.LOG_LEVEL?.trim().toLowerCase();
  if (!raw) return "info";
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  // LOG_LEVEL is shared with the rest of the platform, so an unusual value
  // warns rather than blocking startup.
  warnings.push(`LOG_LEVEL="${raw}" is not a recognised level; the worker is using "info".`);
  return "info";
}

/**
 * Validate the worker's environment.
 *
 * Required:
 * - `NEXT_PUBLIC_SUPABASE_URL` (already used by the app)
 * - one of `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`
 *
 * The service-role credential is the one deliberate privilege escalation in
 * this phase. It is required because the worker has no user session and must
 * monitor every tenant, which RLS scopes by `auth.uid()`. It is read only in
 * this process, never written to a bundle, never returned by an API route and
 * never logged. The alternative — a per-tenant signed-in client — cannot
 * monitor a project its user cannot see, which is the whole point.
 */
export function loadWorkerConfig(
  env: WorkerEnvironment,
  options: { workerId?: string } = {},
): WorkerConfigResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!supabaseUrl) {
    errors.push(
      "NEXT_PUBLIC_SUPABASE_URL is not set. The worker needs the same Supabase project URL as the app.",
    );
  } else if (!/^https?:\/\//i.test(supabaseUrl)) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must be an http(s) URL.");
  }

  // Accept both the legacy service-role JWT and the newer Supabase secret
  // key; both are server-only credentials with the same role.
  const serviceRoleKey = (
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    env.SUPABASE_SECRET_KEY?.trim() ||
    ""
  );
  if (!serviceRoleKey) {
    errors.push(
      "No server-side Supabase credential found. Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) to the service-role key. It must never be a NEXT_PUBLIC_* variable.",
    );
  }
  if (env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    errors.push(
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is set. Any NEXT_PUBLIC_* variable is inlined into the browser bundle — remove it and use the server-only variable.",
    );
  }

  const pollSeconds = readInt(
    env,
    "MONITOR_WORKER_POLL_SECONDS",
    DEFAULTS.pollSeconds,
    2,
    3600,
    errors,
  );
  if (pollSeconds > MIN_SERVICE_INTERVAL_SEC) {
    warnings.push(
      `MONITOR_WORKER_POLL_SECONDS=${pollSeconds} is longer than the smallest configurable service interval (${MIN_SERVICE_INTERVAL_SEC}s); checks will be detected late, never early.`,
    );
  }

  const concurrency = readInt(
    env,
    "MONITOR_WORKER_CONCURRENCY",
    DEFAULTS.concurrency,
    1,
    16,
    errors,
  );
  const batchLimit = readInt(
    env,
    "MONITOR_WORKER_BATCH_LIMIT",
    DEFAULTS.batchLimit,
    1,
    1000,
    errors,
  );
  const leaseSeconds = readInt(
    env,
    "MONITOR_WORKER_LEASE_SECONDS",
    DEFAULTS.leaseSeconds,
    30,
    3600,
    errors,
  );
  const logLevel = readLogLevel(env, warnings);

  // Explicit operator opt-in for private monitoring targets. Absent or blank
  // means default-deny (previous behaviour). A malformed entry fails startup:
  // a half-understood exception list must never silently narrow or widen.
  const trusted = parseTrustedPrivateHosts(env[TRUSTED_PRIVATE_HOSTS_ENV]);
  for (const problem of trusted.errors) {
    errors.push(`${TRUSTED_PRIVATE_HOSTS_ENV}: ${problem}`);
  }

  // Informational only: lets the startup log prove which source revision the
  // running worker was built from. Never required, never secret.
  const buildShaRaw = env.WORKER_BUILD_SHA?.trim() ?? "";
  if (buildShaRaw.length > 128) {
    errors.push("WORKER_BUILD_SHA must be 128 characters or fewer.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    warnings,
    config: {
      supabaseUrl,
      serviceRoleKey,
      workerId:
        options.workerId?.trim() ||
        env.MONITOR_WORKER_ID?.trim() ||
        `worker-${hostname()}-${process.pid}`,
      pollSeconds,
      concurrency,
      batchLimit,
      leaseSeconds,
      projectId: env.MONITOR_WORKER_PROJECT_ID?.trim() || null,
      logLevel,
      once: readBool(env, "MONITOR_WORKER_ONCE", false),
      enabled: readBool(env, "MONITOR_WORKER_ENABLED", true),
      trustedPrivateHosts: trusted.hosts,
      buildSha: buildShaRaw || null,
    },
  };
}

/**
 * A short, secret-free description of the running configuration, safe to log
 * at startup. Deliberately omits every credential.
 */
export function describeWorkerConfig(config: WorkerConfig): Record<string, unknown> {
  return {
    workerId: config.workerId,
    pollSeconds: config.pollSeconds,
    concurrency: config.concurrency,
    batchLimit: config.batchLimit,
    leaseSeconds: config.leaseSeconds,
    projectId: config.projectId,
    mode: config.once ? "single-pass" : "continuous",
    supabaseUrl: config.supabaseUrl,
    // Addressing, not secrets: the operator confirms the exact trusted target
    // from the startup log. Count plus entries (empty means default-deny).
    trustedPrivateHosts: config.trustedPrivateHosts,
    buildSha: config.buildSha ?? "not recorded",
  };
}