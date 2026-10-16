/**
 * Trusted private monitoring targets — default-deny plus explicit opt-in.
 *
 * These tests pin the security contract: absent/empty allowlist behaves
 * exactly as before, only exact operator-configured entries bypass the
 * private-address refusal, and loopback/link-local/metadata-class
 * destinations stay refused no matter what is configured. DNS edge cases
 * run through an injected lookup — no network access.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicHost } from "../../lib/monitoring/external-check";
import { isBlockedAddress } from "../../lib/monitoring/http-check";
import { loadWorkerConfig } from "../../lib/monitoring/worker-config";
import {
  evaluateTrustedAccess,
  isAlwaysBlockedAddress,
  isBypassablePrivateAddress,
  isTrustedHost,
  MAX_TRUSTED_PRIVATE_HOSTS,
  parseTrustedPrivateHosts,
} from "../../lib/monitoring/trusted-targets";

const GOOD = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

test("absent or blank allowlist means no exceptions", () => {
  assert.deepEqual(parseTrustedPrivateHosts(undefined), { hosts: [], errors: [] });
  assert.deepEqual(parseTrustedPrivateHosts(""), { hosts: [], errors: [] });
  assert.deepEqual(parseTrustedPrivateHosts("   "), { hosts: [], errors: [] });
});

test("an exact private IP is accepted and normalized", () => {
  assert.deepEqual(parseTrustedPrivateHosts("172.31.30.138"), {
    hosts: ["172.31.30.138"],
    errors: [],
  });
  // Case, whitespace, trailing dots, and duplicates are normalized away.
  assert.deepEqual(
    parseTrustedPrivateHosts("  172.31.30.138 , 172.31.30.138. ").hosts,
    ["172.31.30.138"],
  );
  assert.deepEqual(parseTrustedPrivateHosts("Podinfo.VPC").hosts, ["podinfo.vpc"]);
});

test("URLs, ports, CIDRs, and wildcards are rejected, not narrowed", () => {
  for (const bad of [
    "http://172.31.30.138",
    "172.31.30.138:9898",
    "172.31.0.0/16",
    "10.0.0.0/8",
    "*.example.com",
    "podinfo:9898",
  ]) {
    const parsed = parseTrustedPrivateHosts(bad);
    assert.equal(parsed.hosts.length, 0, bad);
    assert.equal(parsed.errors.length, 1, bad);
  }
});

test("unsafe hostnames can never be trusted", () => {
  for (const bad of ["localhost", "app.local", "db.internal", "x.svc.cluster.local", "metadata.google.internal"]) {
    const parsed = parseTrustedPrivateHosts(bad);
    assert.equal(parsed.hosts.length, 0, bad);
    assert.equal(parsed.errors.length, 1, bad);
  }
});

test("loopback, link-local, multicast, and documentation addresses can never be trusted", () => {
  for (const bad of [
    "127.0.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "ff02::1",
    "192.0.2.1",
    "203.0.113.5",
  ]) {
    const parsed = parseTrustedPrivateHosts(bad);
    assert.equal(parsed.hosts.length, 0, bad);
    assert.equal(parsed.errors.length, 1, bad);
  }
});

test("the list stays an explicit exception, never a scan", () => {
  const many = Array.from({ length: MAX_TRUSTED_PRIVATE_HOSTS + 1 }, (_, i) => `10.9.9.${i + 1}`).join(",");
  const parsed = parseTrustedPrivateHosts(many);
  assert.ok(parsed.errors.length > 0);
});

test("always-blocked versus bypassable private addresses", () => {
  // Never trustable.
  for (const a of ["127.0.0.1", "127.1.2.3", "0.0.0.0", "169.254.169.254", "224.0.0.1", "::1", "::", "fe80::1", "ff02::1", "::ffff:127.0.0.1"]) {
    assert.equal(isAlwaysBlockedAddress(a), true, a);
    assert.equal(isBypassablePrivateAddress(a), false, a);
  }
  // Bypassable with an exact trust entry (still refused by default).
  for (const a of ["172.31.30.138", "10.0.0.5", "192.168.1.1", "100.64.0.9", "fc00::1", "::ffff:10.0.0.1"]) {
    assert.equal(isAlwaysBlockedAddress(a), false, a);
    assert.equal(isBypassablePrivateAddress(a), true, a);
  }
  // Public addresses need no exception.
  assert.equal(isBypassablePrivateAddress("93.184.216.34"), false);
});

test("exact host matching is case-insensitive and dot-tolerant", () => {
  assert.equal(isTrustedHost("172.31.30.138", ["172.31.30.138"]), true);
  assert.equal(isTrustedHost("Podinfo.VPC.", ["podinfo.vpc"]), true);
  assert.equal(isTrustedHost("172.31.30.139", ["172.31.30.138"]), false);
  assert.equal(isTrustedHost("evil.example.com", []), false);
});

test("an exactly trusted IP literal is allowed", () => {
  assert.deepEqual(evaluateTrustedAccess("172.31.30.138", ["172.31.30.138"], ["172.31.30.138"]), {
    allowed: true,
  });
});

test("an unlisted private IP stays denied", () => {
  const verdict = evaluateTrustedAccess("172.31.30.138", ["172.31.30.138"], []);
  assert.equal(verdict.allowed, false);
});

test("a trusted DNS name needs every resolved address covered", () => {
  const trusted = ["podinfo.vpc", "172.31.30.138"];
  // All public: fine.
  assert.equal(evaluateTrustedAccess("podinfo.vpc", ["93.184.216.34"], trusted).allowed, true);
  // Private but listed: fine.
  assert.equal(evaluateTrustedAccess("podinfo.vpc", ["172.31.30.138"], trusted).allowed, true);
  // Private and unlisted: mixed-answer refusal.
  assert.equal(evaluateTrustedAccess("podinfo.vpc", ["172.31.30.139"], trusted).allowed, false);
  // Mixed public + unlisted private: refused.
  assert.equal(
    evaluateTrustedAccess("podinfo.vpc", ["93.184.216.34", "172.31.30.139"], trusted).allowed,
    false,
  );
  // Never-trustable address, even when the name is trusted: refused.
  assert.equal(
    evaluateTrustedAccess("podinfo.vpc", ["169.254.169.254"], [...trusted, "169.254.169.254"]).allowed,
    false,
  );
  // No addresses: refused.
  assert.equal(evaluateTrustedAccess("podinfo.vpc", [], trusted).allowed, false);
  // Untrusted name: refused without inspecting addresses.
  assert.equal(evaluateTrustedAccess("other.vpc", ["172.31.30.138"], trusted).allowed, false);
});

test("IPv4-mapped IPv6 loopback is blocked, not public", () => {
  // Regression: ::ffff:127.0.0.1 used to fall through isPrivateIPv6 and read
  // as a public address.
  assert.equal(isBlockedAddress("::ffff:127.0.0.1"), true);
  assert.equal(isAlwaysBlockedAddress("::ffff:127.0.0.1"), true);
});

test("resolvePublicHost keeps default-deny without the allowlist", async () => {
  const refused = await resolvePublicHost("172.31.30.138", {
    lookup: async () => [{ address: "172.31.30.138" }],
  });
  assert.match(refused ?? "", /Refusing to check non-public target/);
});

test("resolvePublicHost allows the exact trusted literal", async () => {
  const ok = await resolvePublicHost("172.31.30.138", {
    trustedPrivateHosts: ["172.31.30.138"],
    lookup: async () => [{ address: "172.31.30.138" }],
  });
  assert.equal(ok, null);
});

test("resolvePublicHost still refuses localhost even when listed", async () => {
  const refused = await resolvePublicHost("localhost", {
    // parseTrustedPrivateHosts would never produce this entry; the gate must
    // hold even if a caller bypasses the parser.
    trustedPrivateHosts: ["localhost"],
    lookup: async () => [{ address: "127.0.0.1" }],
  });
  assert.match(refused ?? "", /Refusing to check internal target/);
});

test("resolvePublicHost fails closed on mixed DNS answers", async () => {
  const refused = await resolvePublicHost("podinfo.vpc", {
    trustedPrivateHosts: ["podinfo.vpc", "172.31.30.138"],
    lookup: async () => [{ address: "172.31.30.138" }, { address: "172.31.30.139" }],
  });
  assert.match(refused ?? "", /trusted-target policy/);
});

test("resolvePublicHost reports unresolvable hosts without trusting", async () => {
  const missing = await resolvePublicHost("podinfo.vpc", {
    trustedPrivateHosts: ["podinfo.vpc"],
    lookup: async () => {
      throw new Error("ENOTFOUND");
    },
  });
  assert.match(missing ?? "", /does not resolve/);
});

test("resolvePublicHost leaves public targets untouched", async () => {
  const ok = await resolvePublicHost("example.com", {
    lookup: async () => [{ address: "93.184.216.34" }],
  });
  assert.equal(ok, null);
});

test("worker config accepts an exact trusted target", () => {
  const result = loadWorkerConfig({ ...GOOD, MONITOR_ALLOWED_PRIVATE_HOSTS: "172.31.30.138" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.config.trustedPrivateHosts, ["172.31.30.138"]);
});

test("worker config fails closed on a malformed allowlist", () => {
  const result = loadWorkerConfig({ ...GOOD, MONITOR_ALLOWED_PRIVATE_HOSTS: "localhost" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join(" "), /MONITOR_ALLOWED_PRIVATE_HOSTS/);
});

test("worker config defaults to default-deny and records the build marker", () => {
  const result = loadWorkerConfig({ ...GOOD, WORKER_BUILD_SHA: "abc123" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.config.trustedPrivateHosts, []);
  assert.equal(result.config.buildSha, "abc123");
});
