/**
 * Configured external HTTP checks — the pure core.
 *
 * Safeguard's onboarding captures a monitoring target (target URL) plus an
 * endpoint path. This module turns one execution of that check into an
 * observed service status. Network I/O lives in the server action
 * (`app/projects/[id]/health-actions.ts`); everything here is deterministic
 * and unit-tested.
 *
 * Status semantics (never conflated):
 * - healthy: the endpoint answered with the expected status.
 * - critical: the endpoint answered 5xx, or did not answer at all. A missing
 *   answer is information — the target failed its check — not "unknown".
 * - warning: any other unexpected answer (redirects, client errors, or an
 *   unexpected 2xx). Worth attention, not an outage claim.
 */
import type { ServiceStatus } from "../incidents";

export type HttpCheckClassification = {
  status: Extract<ServiceStatus, "healthy" | "warning" | "critical">;
  /** Single-sample mapping: healthy 0, warning 0.5, critical 1. */
  errorRate: number;
  detail: string;
};

export function classifyHttpStatus(
  statusCode: number,
  expectedStatus: number,
): HttpCheckClassification {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    return { status: "warning", errorRate: 0.5, detail: `Unparseable HTTP status ${statusCode}` };
  }
  if (statusCode === expectedStatus) {
    return { status: "healthy", errorRate: 0, detail: `HTTP ${statusCode} (expected)` };
  }
  if (statusCode >= 500) {
    return { status: "critical", errorRate: 1, detail: `HTTP ${statusCode} (server error)` };
  }
  return {
    status: "warning",
    errorRate: 0.5,
    detail: `HTTP ${statusCode} (expected ${expectedStatus})`,
  };
}

export function classifyNoResponse(reason: "timeout" | "network"): HttpCheckClassification {
  return reason === "timeout"
    ? { status: "critical", errorRate: 1, detail: "No HTTP response before the timeout" }
    : { status: "critical", errorRate: 1, detail: "No HTTP response (connection failed)" };
}

const BLOCKED_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".invalid",
  ".test",
  ".example",
  ".svc.cluster.local",
];

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

/** Hostnames that must never be fetched server-side, without any DNS lookup. */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (BLOCKED_HOSTS.has(host)) return true;
  return BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a >= 224 && a <= 239) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && (b === 51 || b === 100)) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("ff")) return true;
  return false;
}

/** True when a resolved address must never be fetched server-side. */
export function isBlockedAddress(address: string): boolean {
  const normalized = address.trim().replace(/^\[|\]$/g, "");
  if (normalized.includes(":")) return isPrivateIPv6(normalized);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return isPrivateIPv4(normalized);
  // Not an IP literal — resolution decides; treat unparseable input as blocked.
  return true;
}
