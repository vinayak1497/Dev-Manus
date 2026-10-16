/**
 * Trusted private monitoring targets — explicit operator opt-in.
 *
 * Default behaviour is unchanged: when no allowlist is configured, every
 * private/non-public destination is refused exactly as before (see
 * `resolvePublicHost` in `./external-check` and the SSRF tables in
 * `./http-check`). An entry here bypasses ONLY the "private address" refusal,
 * and only for an exactly configured host whose every resolved address is
 * individually safe:
 *
 * - Unsafe hostnames (`localhost`, `*.local`, `*.internal`, …) can never be
 *   trusted, even when listed.
 * - Addresses that must never be fetched (loopback, link-local incl. the
 *   cloud metadata address, multicast, unspecified, documentation ranges) can
 *   never be trusted, even when listed.
 * - A trusted DNS name whose answers include an unlisted private address, a
 *   never-trustable address, or no addresses at all is refused (fail closed).
 * - URL credentials, followed redirects, and stored bodies are unaffected:
 *   credentials are still rejected, redirects are still recorded-not-followed,
 *   and response bodies are still never persisted.
 *
 * The allowlist is worker-side configuration (`MONITOR_ALLOWED_PRIVATE_HOSTS`,
 * comma-separated exact hosts/IPs), never a project-user field: entering a
 * private IP in the onboarding form does NOT trust it. IP literals are the
 * recommended form — a literal has no DNS to rebind between the pre-flight
 * lookup and `fetch`'s own connect-time resolution. DNS names are supported
 * conservatively (hostname AND every resolved address must be covered), and
 * the residual lookup-vs-connect window for names is documented in the demo
 * runbook rather than silently accepted.
 *
 * Everything here is pure (no IO) and unit-tested.
 */
import { isIP } from "node:net";
import { isBlockedAddress, isBlockedHostname } from "./http-check";

export const TRUSTED_PRIVATE_HOSTS_ENV = "MONITOR_ALLOWED_PRIVATE_HOSTS";

/** Hard cap so the list stays an explicit exception, never a subnet scan. */
export const MAX_TRUSTED_PRIVATE_HOSTS = 16;

export type TrustedPrivateHostsParse = {
  hosts: string[];
  errors: string[];
};

/** Canonical form for comparison: lowercase, no trailing dots, no brackets. */
export function normalizeTrustedHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\[/, "").replace(/\]+$/, "").replace(/\.+$/, "");
}

function isValidHostnameEntry(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  // Labels of letters/digits/hyphens separated by dots. Single-label
  // intranet names are accepted — every resolved address is still checked.
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(
    host,
  );
}

/**
 * Addresses that must never be fetched, even with an explicit trust entry:
 * loopback, link-local (includes the 169.254.169.254 metadata endpoint),
 * multicast, unspecified, and documentation ranges that can never be real
 * destinations. Everything else `isBlockedAddress` refuses (RFC 1918, CGNAT,
 * ULA) is bypassable with an exact trust entry.
 */
export function isAlwaysBlockedAddress(address: string): boolean {
  const normalized = address.trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized.includes(":")) {
    // IPv4-mapped IPv6 (e.g. ::ffff:10.0.0.1): judge the embedded IPv4 in
    // dotted form; any other mapped shape fails closed.
    const mapped = normalized.match(/^::ffff:(.+)$/);
    if (mapped) {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(mapped[1])) return isAlwaysBlockedIPv4(mapped[1]);
      return true;
    }
    if (normalized === "::1" || normalized === "::") return true;
    const first = normalized.split(":")[0];
    const group = Number.parseInt(first, 16);
    if (Number.isInteger(group)) {
      // fe80::/10 link-local, ff00::/8 multicast.
      if ((group & 0xffc0) === 0xfe80) return true;
      if ((group & 0xff00) === 0xff00) return true;
    }
    // Deprecated site-local fec0::/10: fail closed (use fc00::/7 ULA instead).
    if (/^fec[0-9a-f]/i.test(first)) return true;
    return false;
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return true; // unparseable: fail closed
  return isAlwaysBlockedIPv4(normalized);
}

function isAlwaysBlockedIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b, c] = parts;
  if (a === 127) return true; // loopback
  if (a === 0) return true; // unspecified ("this network")
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a >= 224 && a <= 239) return true; // multicast
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1 (documentation)
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2 (documentation)
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3 (documentation)
  return false;
}

/**
 * A refused address that an exact trust entry MAY excuse. This is precisely
 * the set `isBlockedAddress` refuses minus the never-trustable set above.
 */
export function isBypassablePrivateAddress(address: string): boolean {
  return isBlockedAddress(address) && !isAlwaysBlockedAddress(address);
}

/**
 * Parse the worker-side allowlist. Absent/blank means "no exceptions"
 * (default-deny, previous behaviour). Malformed entries are errors — a
 * half-understood exception list must fail startup, not silently narrow.
 */
export function parseTrustedPrivateHosts(raw: string | undefined): TrustedPrivateHostsParse {
  const hosts: string[] = [];
  const errors: string[] = [];
  if (raw === undefined || raw.trim() === "") return { hosts, errors };
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    if (part.trim() === "") continue;
    const host = normalizeTrustedHost(part);
    if (host.includes("://")) {
      errors.push(`"${part.trim()}": use a bare host or IP, not a URL.`);
      continue;
    }
    if (/[@/?#\s]/.test(host)) {
      errors.push(`"${part.trim()}": host must not contain @, /, ?, #, or whitespace.`);
      continue;
    }
    // A port looks like "1.2.3.4:9898" — colons only belong to IPv6 literals.
    if (host.includes(":") && isIP(host) !== 6) {
      errors.push(`"${part.trim()}": use a bare host without a port.`);
      continue;
    }
    if (isIP(host) === 4 || isIP(host) === 6) {
      if (isAlwaysBlockedAddress(host)) {
        errors.push(`"${part.trim()}": loopback, link-local, multicast, or documentation addresses can never be trusted.`);
        continue;
      }
    } else {
      if (!isValidHostnameEntry(host)) {
        errors.push(`"${part.trim()}": not a valid hostname or IP literal.`);
        continue;
      }
      if (isBlockedHostname(host)) {
        errors.push(`"${part.trim()}": this hostname class is never fetched and can never be trusted.`);
        continue;
      }
    }
    if (seen.has(host)) continue;
    seen.add(host);
    hosts.push(host);
  }
  if (hosts.length + errors.length > 0 && hosts.length > MAX_TRUSTED_PRIVATE_HOSTS) {
    errors.push(
      `Too many trusted hosts (${hosts.length}); the maximum is ${MAX_TRUSTED_PRIVATE_HOSTS}. Keep this an explicit exception list.`,
    );
  }
  return { hosts, errors };
}

export function isTrustedHost(hostname: string, trusted: readonly string[]): boolean {
  const host = normalizeTrustedHost(hostname);
  if (host === "") return false;
  return trusted.some((entry) => entry === host);
}

export type TrustedAccessVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * Decide whether an exactly-trusted hostname may bypass the private-address
 * refusal for one concrete resolution result. Pure: pass the addresses a DNS
 * lookup returned (or the literal itself for IP targets) so tests drive every
 * edge case without network access.
 */
export function evaluateTrustedAccess(
  hostname: string,
  resolvedAddresses: readonly string[],
  trusted: readonly string[],
): TrustedAccessVerdict {
  const host = normalizeTrustedHost(hostname);
  if (host === "" || !trusted.some((entry) => entry === host)) {
    return { allowed: false, reason: "hostname is not in the trusted allowlist" };
  }
  if (isBlockedHostname(host)) {
    return { allowed: false, reason: "this hostname class is never fetched and cannot be trusted" };
  }
  if (isIP(host) === 4 || isIP(host) === 6) {
    // IP literal: the pre-flight lookup returns the literal itself, so there
    // is no lookup-vs-connect window for this form (the recommended form).
    if (isAlwaysBlockedAddress(host)) {
      return { allowed: false, reason: "loopback, link-local, multicast, or documentation addresses cannot be trusted" };
    }
    return { allowed: true };
  }
  if (resolvedAddresses.length === 0) {
    return { allowed: false, reason: "hostname did not resolve" };
  }
  for (const rawAddress of resolvedAddresses) {
    const address = normalizeTrustedHost(rawAddress);
    if (isAlwaysBlockedAddress(address)) {
      return {
        allowed: false,
        reason: `resolved address "${address}" is never trustable (loopback, link-local, multicast, or documentation)`,
      };
    }
    if (isBlockedAddress(address) && !trusted.some((entry) => entry === address)) {
      return {
        allowed: false,
        reason: `resolved private address "${address}" is not itself in the trusted allowlist; refusing a mixed or unexpected answer`,
      };
    }
  }
  return { allowed: true };
}
