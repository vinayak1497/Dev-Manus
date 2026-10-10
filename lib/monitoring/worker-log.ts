/**
 * Structured JSON logging for the monitoring worker.
 *
 * Built on the Node standard library only. The repository has no logging
 * framework and adding one for a single background process would be exactly
 * the kind of dependency RULE.md tells us not to take.
 *
 * Rules this module enforces, not just documents:
 * - one JSON object per line, so `journalctl` and `docker logs` stay readable
 *   without a parser;
 * - keys that look like credentials are REDACTED before anything is written,
 *   so a future caller cannot leak a key by passing it in a field (RULE.md 11,
 *   24). The value is never formatted, not even truncated;
 * - error objects are reduced to `name` + `message`. Stacks, request objects
 *   and `cause` chains are where secrets and headers end up, so they are not
 *   written by default.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Guard against pathological nesting when redacting structured log fields. */
const MAX_DEPTH = 6;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_WORD =
  /(secret|token|password|passwd|apikey|authorization|cookie|credential|privatekey|signing|bearer|session)/;

/**
 * Is this field name likely to hold a credential?
 *
 * Deliberately over-inclusive: a false positive costs one `[redacted]` in a
 * log line, while a false negative prints a live key to disk and to every log
 * aggregator downstream. Anything ending in "key" is treated as sensitive,
 * which is what catches `supabaseServiceRoleKey`, `secretKey` and friends.
 */
function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (SENSITIVE_WORD.test(normalized)) return true;
  return normalized.endsWith("key");
}

function redactValue(value: unknown, depth: number): unknown {
  if (value instanceof Error) {
    // name + message only: stacks and `cause` chains are where headers,
    // tokens and connection strings end up.
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return depth >= MAX_DEPTH ? "[truncated]" : value.map((item) => redactValue(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    if (depth >= MAX_DEPTH) return "[truncated]";
    return redact(value as Record<string, unknown>, depth + 1);
  }
  return value;
}

function redact(fields: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = isSensitiveKey(key) ? "[redacted]" : redactValue(value, depth);
  }
  return out;
}

export type WorkerLogger = {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(base: Record<string, unknown>): WorkerLogger;
};

export type LoggerOptions = {
  level?: LogLevel;
  /** Injectable sinks; defaults to the process stdout/stderr. */
  write?: (line: string) => void;
  writeError?: (line: string) => void;
  base?: Record<string, unknown>;
};

export function createWorkerLogger(options: LoggerOptions = {}): WorkerLogger {
  const level = options.level ?? "info";
  const threshold = LEVEL_ORDER[level];
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const writeError =
    options.writeError ?? ((line: string) => process.stderr.write(`${line}\n`));
  const base = options.base ?? {};

  const emit = (
    entryLevel: LogLevel,
    message: string,
    fields?: Record<string, unknown>,
  ): void => {
    if (LEVEL_ORDER[entryLevel] < threshold) return;
    const payload = {
      ts: new Date().toISOString(),
      level: entryLevel,
      msg: message,
      ...base,
      ...(fields ? redact(fields) : {}),
    };
    const line = JSON.stringify(payload);
    if (entryLevel === "error" || entryLevel === "warn") writeError(line);
    else write(line);
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (childBase) =>
      createWorkerLogger({
        level,
        write,
        writeError,
        base: { ...base, ...redact(childBase) },
      }),
  };
}