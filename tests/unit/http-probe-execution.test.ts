/**
 * Phase 1 HTTP execution tests — the fetch → classify → persist seam.
 *
 * These prove the REAL end of Phase 1 without touching production telemetry:
 * a local stdlib `node:http` server plays the role of the configured target,
 * and the test drives the exact request contract `runConfiguredHttpCheck`
 * (`app/projects/[id]/health-actions.ts`) uses — GET, `redirect: "manual"`,
 * `AbortController` timeout, discarded body — then composes the persisted row
 * through the same pure `buildExternalObservation` the action uses.
 *
 * Deliberately NOT covered here (covered elsewhere, never weakened for tests):
 * - SSRF guards (`isBlockedHostname` / `isBlockedAddress` in
 *   `http-check.test.ts`). The local server binds 127.0.0.1, which production
 *   correctly REFUSES to probe — so these tests exercise the fetch seam
 *   directly instead of bypassing the guard.
 * - URL construction (`buildHealthCheckUrl` in `onboarding-health.test.ts`).
 * - Detection (`reconcileService` in `reconcile.test.ts`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildExternalObservation,
  classifyHttpStatus,
  classifyNoResponse,
  type HttpCheckClassification,
} from "../../lib/monitoring/http-check";

const BODY_MARKER = "body-that-must-never-persist-9f3c2a1";

/** One deterministic origin with the routes Phase 1 acceptance needs. */
let server: Server | null = null;
let baseUrl = "";

async function testBaseUrl(): Promise<string> {
  if (baseUrl) return baseUrl;
  server = createServer((req, res) => {
    // A destroyed socket (client timed out) must never crash the server.
    res.on("error", () => undefined);
    const url = req.url ?? "/";
    if (url === "/ok") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`fine:${BODY_MARKER}`);
    } else if (url === "/fail") {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`broken:${BODY_MARKER}`);
    } else if (url === "/redirect") {
      res.writeHead(301, { Location: "/ok" });
      res.end();
    } else if (url === "/slow") {
      const timer = setTimeout(() => {
        if (!res.destroyed) {
          try {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("eventually");
          } catch {
            // Client already gone — nothing to do.
          }
        }
      }, 500);
      req.on("close", () => clearTimeout(timer));
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("missing");
    }
  });
  server.unref();
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server?.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  return baseUrl;
}

test.after(async () => {
  if (server) {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    baseUrl = "";
  }
});

type ProbeOutcome = {
  statusCode: number | null;
  classification: HttpCheckClassification;
  latencyMs: number;
};

/**
 * The production request contract, verbatim in options:
 * `app/projects/[id]/health-actions.ts` — GET, manual redirects,
 * AbortController timeout, body drained and discarded.
 */
async function probe(
  url: string,
  expected: number,
  timeoutMs: number,
): Promise<ProbeOutcome> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let statusCode: number | null = null;
  let classification: HttpCheckClassification;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "User-Agent": "devops-safeguard-check/1.0" },
    });
    statusCode = res.status;
    // Drain nothing: the body is irrelevant and never stored.
    await res.arrayBuffer().catch(() => null);
    classification = classifyHttpStatus(res.status, expected);
  } catch (error) {
    classification =
      error instanceof Error && error.name === "AbortError"
        ? classifyNoResponse("timeout")
        : classifyNoResponse("network");
  } finally {
    clearTimeout(timer);
  }
  return { statusCode, classification, latencyMs: Date.now() - started };
}

test("a real HTTP 200 composes a healthy external observation", async () => {
  const root = await testBaseUrl();
  const checkedUrl = `${root}/ok`;
  const outcome = await probe(checkedUrl, 200, 5000);

  assert.equal(outcome.statusCode, 200);
  assert.equal(outcome.classification.status, "healthy");
  assert.ok(outcome.latencyMs >= 0);

  const observation = buildExternalObservation({
    checkedUrl,
    target: root,
    path: "/ok",
    statusCode: outcome.statusCode,
    expectedStatus: 200,
    latencyMs: outcome.latencyMs,
    classification: outcome.classification,
    checkedAt: new Date().toISOString(),
  });

  // The persisted Phase 1 contract (Test Group D).
  assert.equal(observation.status, "healthy");
  assert.equal(observation.source, "external");
  assert.equal(observation.isDemo, false);
  assert.equal(observation.errorRate, 0);
  assert.equal(observation.metadata.checked_url, checkedUrl);
  assert.equal(observation.metadata.status_code, 200);
  assert.equal(observation.metadata.expected_status, 200);
  assert.match(observation.detail, /HTTP 200/);
  // The response body travelled the wire but must not be persisted.
  assert.ok(!JSON.stringify(observation).includes(BODY_MARKER));
});

test("a real HTTP 500 composes a critical external observation", async () => {
  const root = await testBaseUrl();
  const checkedUrl = `${root}/fail`;
  const outcome = await probe(checkedUrl, 200, 5000);

  assert.equal(outcome.statusCode, 500);
  assert.equal(outcome.classification.status, "critical");
  assert.equal(outcome.classification.errorRate, 1);

  const observation = buildExternalObservation({
    checkedUrl,
    target: root,
    path: "/fail",
    statusCode: outcome.statusCode,
    expectedStatus: 200,
    latencyMs: outcome.latencyMs,
    classification: outcome.classification,
    checkedAt: new Date().toISOString(),
  });

  assert.equal(observation.status, "critical");
  assert.equal(observation.source, "external");
  assert.equal(observation.isDemo, false);
  assert.equal(observation.metadata.status_code, 500);
  assert.ok(!JSON.stringify(observation).includes(BODY_MARKER));
});

test("redirects are observed, not followed", async () => {
  const root = await testBaseUrl();
  const outcome = await probe(`${root}/redirect`, 200, 5000);

  // `redirect: "manual"` surfaces the 301 itself; following it would have
  // reported the 200 behind /ok instead.
  assert.equal(outcome.statusCode, 301);
  assert.equal(outcome.classification.status, "warning");
});

test("a delayed response past the timeout is a critical timeout", async () => {
  const root = await testBaseUrl();
  const checkedUrl = `${root}/slow`;
  const outcome = await probe(checkedUrl, 200, 100);

  assert.equal(outcome.statusCode, null);
  assert.equal(outcome.classification.status, "critical");
  assert.equal(
    outcome.classification.detail,
    "No HTTP response before the timeout",
  );

  const observation = buildExternalObservation({
    checkedUrl,
    target: root,
    path: "/slow",
    statusCode: outcome.statusCode,
    expectedStatus: 200,
    latencyMs: outcome.latencyMs,
    classification: outcome.classification,
    checkedAt: new Date().toISOString(),
  });

  assert.equal(observation.status, "critical");
  assert.equal(observation.metadata.status_code, null);
  assert.match(observation.detail, /no response/);
});

test("an unreachable target is a critical network failure", async () => {
  // A port that was just closed refuses connections deterministically.
  const doomed = createServer();
  await new Promise<void>((resolve) => doomed.listen(0, "127.0.0.1", resolve));
  const port = (doomed.address() as AddressInfo).port;
  await new Promise<void>((resolve) => doomed.close(() => resolve()));

  const outcome = await probe(`http://127.0.0.1:${port}/ok`, 200, 5000);

  assert.equal(outcome.statusCode, null);
  assert.equal(outcome.classification.status, "critical");
  assert.equal(
    outcome.classification.detail,
    "No HTTP response (connection failed)",
  );
});

test("observation metadata carries exactly the audited fields", () => {
  const observation = buildExternalObservation({
    checkedUrl: "https://app.example.com/healthz",
    target: "https://app.example.com",
    path: "/healthz",
    statusCode: 200,
    expectedStatus: 200,
    latencyMs: 42,
    classification: classifyHttpStatus(200, 200),
    checkedAt: "2026-10-03T00:00:00.000Z",
  });

  // No response body, headers, cookies, or secrets — only the audited set.
  assert.deepEqual(Object.keys(observation.metadata).sort(), [
    "checked_url",
    "expected_status",
    "path",
    "status_code",
    "target",
  ]);
  assert.equal(observation.checkedAt, "2026-10-03T00:00:00.000Z");
});
