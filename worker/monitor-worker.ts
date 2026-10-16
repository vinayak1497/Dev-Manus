/**
 * DevOps Safeguard — automatic monitoring worker.
 *
 * A plain Node.js process. It has no HTTP surface, no browser, no user session
 * and no dependency on the Next.js runtime — monitoring continues whether or
 * not anyone has the application open.
 *
 * It supervises itself only in the sense of "never overlap with itself": a
 * pass is started, awaited, and the next one is scheduled after it finishes.
 * Process supervision (restart on crash) is the operating system's job — on
 * the EC2 host that is systemd; see PHASE_2_MANUAL_TESTING_AND_DEPLOYMENT.md.
 *
 * Lifecycle:
 *   1. load `.env.local` / `.env` for local development (real environment
 *      variables always win, which is what systemd relies on);
 *   2. validate configuration and EXIT NON-ZERO if it is unusable;
 *   3. verify the database is reachable and the Phase 2 migration is applied;
 *   4. loop: run one scheduler pass, wait, repeat;
 *   5. on SIGTERM/SIGINT: stop starting new passes, wait for the in-flight one,
 *      release this worker's claims so a restart resumes immediately.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import {
  describeWorkerConfig,
  loadWorkerConfig,
  type WorkerEnvironment,
} from "../lib/monitoring/worker-config";
import { createWorkerLogger } from "../lib/monitoring/worker-log";
import {
  releaseWorkerClaims,
  runSchedulerTick,
} from "../lib/monitoring/scheduler";

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load local development environment files, if they exist.
 *
 * `.env.local` wins over `.env` (the same precedence Next.js uses), and a
 * variable that is ALREADY in the real environment is never overwritten — so
 * on a deployed host systemd's `EnvironmentFile` always wins and this is a
 * no-op. Values are never logged.
 */
function loadLocalEnv(cwd: string): WorkerEnvironment {
  const env: WorkerEnvironment = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    try {
      const contents = readFileSync(resolve(cwd, file), "utf8");
      for (const [key, value] of Object.entries(parseEnvFile(contents))) {
        if (env[key] === undefined) env[key] = value;
      }
    } catch {
      // Absent or unreadable env file is normal on a deployed host.
    }
  }
  return env;
}

/** `--project <id>` / `--project=<id>` — restrict one pass to one project. */
function readProjectArg(argv: string[]): string | null {
  const inline = argv.find((a) => a.startsWith("--project="));
  if (inline) return inline.slice("--project=".length).trim() || null;
  const index = argv.indexOf("--project");
  if (index >= 0 && argv[index + 1]) return argv[index + 1].trim();
  return null;
}

const USAGE = `DevOps Safeguard automatic monitoring worker

  node .worker-build/worker/monitor-worker.js [options]

Options:
  --once             Run exactly one scheduler pass, then exit.
  --project <uuid>   Only consider this project in this run.
  -h, --help         Show this message.

Configuration (environment):
  NEXT_PUBLIC_SUPABASE_URL        required
  SUPABASE_SERVICE_ROLE_KEY       required (or SUPABASE_SECRET_KEY)
  MONITOR_WORKER_ENABLED          default true
  MONITOR_WORKER_POLL_SECONDS     default 10
  MONITOR_WORKER_CONCURRENCY      default 4  (1-16)
  MONITOR_WORKER_BATCH_LIMIT      default 200 (1-1000)
  MONITOR_WORKER_LEASE_SECONDS    default 120 (30-3600)
  MONITOR_WORKER_ID               default worker-<host>-<pid>
  MONITOR_WORKER_PROJECT_ID       default: all enabled projects
  MONITOR_ALLOWED_PRIVATE_HOSTS     default: unset (private targets refused)
  WORKER_BUILD_SHA                  default: unset (startup log shows "not recorded")
  LOG_LEVEL                       default info (debug|info|warn|error)
`;

async function main(argv: string[]): Promise<number> {
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const onceFromArgv = argv.includes("--once");
  const projectFromArgv = readProjectArg(argv);

  const env = loadLocalEnv(process.cwd());
  const loaded = loadWorkerConfig(env);
  if (loaded.ok) {
    if (onceFromArgv) loaded.config.once = true;
    if (projectFromArgv) loaded.config.projectId = projectFromArgv;
  }
  if (wantsHelp) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!loaded.ok) {
    // Before the logger exists: configuration is the one failure that must be
    // impossible to miss. Plain stderr, no credentials, exit non-zero.
    process.stderr.write("devops-safeguard monitoring worker: cannot start\n");
    for (const problem of loaded.errors) {
      process.stderr.write(`  - ${problem}\n`);
    }
    return 1;
  }

  const config = loaded.config;
  const log = createWorkerLogger({
    level: config.logLevel,
    base: { component: "monitor-worker" },
  });

  for (const warning of loaded.warnings) log.warn("worker.config_warning", { detail: warning });
  log.info("worker.starting", describeWorkerConfig(config));

  if (!config.enabled) {
    log.warn("worker.disabled", {
      detail: "MONITOR_WORKER_ENABLED is off; the worker will exit without monitoring.",
    });
    return 0;
  }

  const supabase = createServiceRoleClient({
    supabaseUrl: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
  });

  // Fail fast and loudly if the schema the scheduler depends on is missing,
  // rather than logging "0 eligible projects" forever.
  const { error: probeError } = await supabase
    .from("project_configs")
    .select("project_id")
    .eq("monitoring_enabled", true)
    .limit(1);
  if (probeError) {
    log.error("worker.schema_unavailable", {
      message: probeError.message,
      code: probeError.code,
      hint: "Apply supabase/migrations/20261004000000_automatic_monitoring.sql (supabase db push), then restart the worker.",
    });
    return 1;
  }

  // A sleep the shutdown signal can cut short, so a supervised stop is prompt
  // instead of waiting out a whole poll interval.
  let wake: (() => void) | null = null;
  const interruptibleSleep = (ms: number): Promise<void> =>
    new Promise<void>((resolveSleep) => {
      wake = resolveSleep;
      setTimeout(() => {
        wake = null;
        resolveSleep();
      }, ms);
    });

  let stopping = false;
  let passRunning = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("worker.shutdown_requested", { signal });
    wake?.();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  /** How long to wait before retrying a pass after an infrastructure failure. */
const PASS_BACKOFF_BASE_MS = 5_000;
const PASS_BACKOFF_MAX_MS = 60_000;

function passBackoffMs(consecutiveFailures: number): number {
  return Math.min(PASS_BACKOFF_MAX_MS, PASS_BACKOFF_BASE_MS * 2 ** Math.min(4, Math.max(0, consecutiveFailures - 1)));
}

  const runPass = async (): Promise<boolean> => {
    if (passRunning) {
      // Belt and braces alongside the sequential loop below: a pass must
      // never overlap another pass in this process.
      log.warn("worker.pass_skipped", { reason: "a pass is already running" });
      return true;
    }
    passRunning = true;
    const startedAt = Date.now();
    try {
      const result = await runSchedulerTick({
        supabase,
        workerId: config.workerId,
        projectId: config.projectId,
        batchLimit: config.batchLimit,
        leaseSeconds: config.leaseSeconds,
        concurrency: config.concurrency,
        trustedPrivateHosts: config.trustedPrivateHosts,
        log: (level, message, fields) => log[level](message, fields),
      });
      log[result.ok ? "info" : "warn"]("worker.pass_completed", {
        ok: result.ok,
        eligible: result.eligible,
        due: result.due,
        checked: result.checked,
        failed: result.failed,
        skipped: result.skipped,
        ineligible: result.ineligible,
        durationMs: Date.now() - startedAt,
        ...(result.error ? { detail: result.error } : {}),
      });
      return result.ok;
    } catch (error) {
      log.error("worker.pass_failed", { error });
      return false;
    } finally {
      passRunning = false;
    }
  };

  // The loop is strictly sequential: a pass always finishes before the next one
  // is scheduled, so two passes can never overlap inside this process. Claims
  // in the database additionally stop two PROCESSES overlapping.
  let consecutivePassFailures = 0;
  for (;;) {
    const passOk = await runPass();
    consecutivePassFailures = passOk ? 0 : consecutivePassFailures + 1;
    if (config.once || stopping) break;
    // A pass that failed at the infrastructure level (the database is down,
    // the migration is missing) must not tight-loop: back off with a bound.
    // Individual monitored applications failing never triggers this — a pass
    // that ran its checks is a healthy pass.
    if (!passOk) {
      const backoff = passBackoffMs(consecutivePassFailures);
      log.warn("worker.pass_backoff", {
        consecutiveFailures: consecutivePassFailures,
        backoffMs: backoff,
      });
      await interruptibleSleep(backoff);
      if (stopping) break;
    }
    await interruptibleSleep(config.pollSeconds * 1000);
    if (stopping) break;
  }

  log.info("worker.releasing_claims", { workerId: config.workerId });
  const released = await releaseWorkerClaims(supabase, config.workerId).catch(() => 0);
  log.info("worker.stopped", { releasedClaims: released });
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `devops-safeguard monitoring worker crashed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  },
);