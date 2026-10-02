/**
 * Pure normalization for persisted onboarding configuration.
 *
 * `project_configs` stores the canonical wizard sections as JSONB. This
 * module narrows that untrusted JSON without any Supabase I/O, so the
 * Review → payload → storage → read-back loop can be regression-tested
 * directly. The server loader in `lib/project-config.ts` only supplies RLS-
 * scoped rows to `normalizeStoredConfig`.
 */
import type { Json } from "../supabase/database.types";

export type MonitoringStatus = "pending" | "active" | "degraded" | "unknown";

export const MONITORING_VALUES: readonly MonitoringStatus[] = [
  "pending",
  "active",
  "degraded",
  "unknown",
];

export type StoredDeployment = { strategy: string | null; notes: string | null };

export type StoredRuntime = {
  buildCommand: string | null;
  /** Production entrypoint. Never conflated with the dev command. */
  startCommand: string | null;
  devCommand: string | null;
  runtime: string | null;
  port: string | null;
  protocol: string | null;
  rootDirectory: string | null;
};

export type StoredHealth = {
  method: string | null;
  targetType: string | null;
  targetUrl: string | null;
  endpoint: string | null;
  expectedStatus: string | null;
  intervalSec: string | null;
  timeoutSec: string | null;
  failureThreshold: string | null;
};

export type StoredDependencies = {
  postgres: string | null;
  mysql: string | null;
  mongodb: string | null;
  redis: string | null;
  externalApis: string[];
  queues: string[];
};

export type StoredProjectConfig = {
  monitoringStatus: MonitoringStatus;
  branch: string | null;
  repositoryProvider: string | null;
  deployment: StoredDeployment | null;
  runtime: StoredRuntime | null;
  health: StoredHealth | null;
  dependencies: StoredDependencies | null;
  envVarCount: number;
  secretCount: number;
  /** Secret NAMES only — values are never read. */
  secretNames: string[];
};

export type StoredConfigRow = {
  monitoring_status: unknown;
  branch: unknown;
  repository_provider: unknown;
  deployment: Json | null;
  runtime: Json | null;
  dependencies: Json | null;
  health: Json | null;
};

export type StoredEnvRow = {
  key: unknown;
  is_secret: unknown;
  has_value?: unknown;
};

function asRecord(value: Json | null): Record<string, Json> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function text(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function textList(value: Json | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
}

export function normalizeStoredDeployment(value: Json | null): StoredDeployment | null {
  const r = asRecord(value);
  if (!r) return null;
  const strategy = text(r.strategy);
  const notes = text(r.notes);
  if (!strategy && !notes) return null;
  return { strategy, notes };
}

export function normalizeStoredRuntime(value: Json | null): StoredRuntime | null {
  const r = asRecord(value);
  if (!r) return null;
  const out: StoredRuntime = {
    buildCommand: text(r.buildCommand),
    startCommand: text(r.startCommand),
    devCommand: text(r.devCommand),
    runtime: text(r.runtime),
    port: text(r.port),
    protocol: text(r.protocol),
    rootDirectory: text(r.rootDirectory),
  };
  const hasAny = Object.values(out).some((v) => v !== null);
  return hasAny ? out : null;
}

export function normalizeStoredHealth(value: Json | null): StoredHealth | null {
  const r = asRecord(value);
  if (!r) return null;
  const out: StoredHealth = {
    method: text(r.method),
    targetType: text(r.targetType),
    targetUrl: text(r.targetUrl),
    endpoint: text(r.endpoint),
    expectedStatus: text(r.expectedStatus),
    intervalSec: text(r.intervalSec),
    timeoutSec: text(r.timeoutSec),
    failureThreshold: text(r.failureThreshold),
  };
  const hasAny = Object.values(out).some((v) => v !== null);
  return hasAny ? out : null;
}

export function normalizeStoredDependencies(value: Json | null): StoredDependencies | null {
  const r = asRecord(value);
  if (!r) return null;
  return {
    postgres: text(r.postgres),
    mysql: text(r.mysql),
    mongodb: text(r.mongodb),
    redis: text(r.redis),
    externalApis: textList(r.externalApis),
    queues: textList(r.queues),
  };
}

export function normalizeStoredConfig(
  row: StoredConfigRow | null,
  envRows: StoredEnvRow[],
): StoredProjectConfig | null {
  if (!row) return null;
  const secrets = envRows.filter((e) => e.is_secret === true);
  const plain = envRows.filter((e) => e.is_secret !== true);
  const rawStatus = row.monitoring_status;
  const monitoringStatus = MONITORING_VALUES.includes(rawStatus as MonitoringStatus)
    ? (rawStatus as MonitoringStatus)
    : "unknown";
  return {
    monitoringStatus,
    branch: typeof row.branch === "string" && row.branch.trim() !== "" ? row.branch.trim() : null,
    repositoryProvider:
      typeof row.repository_provider === "string" && row.repository_provider.trim() !== ""
        ? row.repository_provider.trim()
        : null,
    deployment: normalizeStoredDeployment(row.deployment),
    runtime: normalizeStoredRuntime(row.runtime),
    health: normalizeStoredHealth(row.health),
    dependencies: normalizeStoredDependencies(row.dependencies),
    envVarCount: plain.length,
    secretCount: secrets.length,
    secretNames: secrets
      .map((s) => s.key)
      .filter((k): k is string => typeof k === "string" && k.trim() !== "")
      .sort(),
  };
}
