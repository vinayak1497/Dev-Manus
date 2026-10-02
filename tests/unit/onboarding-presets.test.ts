/**
 * Detection-preset tests — the trust boundary between "what the repository
 * shows" and "what the wizard claims".
 *
 * Each test here corresponds to a way the wizard used to lie to the user:
 * inventing commands and versions, and reporting a dependency as
 * "Auto-detected" because a *filename* happened to contain the letters.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFileMap, unavailableAnalysis } from "../../lib/onboarding/analyze";
import {
  suggestDependenciesFromAnalysis,
  suggestHealthFromAnalysis,
  suggestRuntimeFromAnalysis,
} from "../../lib/onboarding/presets";
import { deploymentOptionsFromAnalysis } from "../../lib/onboarding/deployment";
import { emptyWizardState } from "../../lib/onboarding/types";

const OPTS = {
  provider: "github" as const,
  owner: "org",
  repo: "repo",
  branch: "main",
};

// ---------------------------------------------------------------------------
// Dependency detection — evidence tiers, and no filename matching
// ---------------------------------------------------------------------------

test("regression: a file named page.tsx does NOT imply PostgreSQL", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({
        dependencies: { next: "14.0.0", react: "18.0.0" },
      }),
      "src/app/page.tsx": "export default function Page() { return null }",
      "src/app/components/PageLoader.tsx": "export const PageLoader = 1",
    },
    OPTS,
  );
  const deps = suggestDependenciesFromAnalysis(a);
  // "page"/"Page" contains the substring "pg" — the old substring matcher
  // reported every one of these services as detected.
  assert.notEqual(deps.postgres, "detected");
  assert.notEqual(deps.postgres, "unknown");
  assert.equal(deps.postgres, "not_detected");
  assert.equal(deps.mysql, "not_detected");
  assert.equal(deps.mongodb, "not_detected");
  assert.equal(deps.redis, "not_detected");
});

test("a driver package alone is capability evidence, so Unknown — not Detected", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({
        dependencies: { pg: "8.0.0", redis: "4.0.0", mongoose: "8.0.0" },
      }),
    },
    OPTS,
  );
  const deps = suggestDependenciesFromAnalysis(a);
  assert.equal(deps.postgres, "unknown");
  assert.equal(deps.redis, "unknown");
  assert.equal(deps.mongodb, "unknown");
  assert.equal(deps.mysql, "not_detected", "no MySQL evidence at all");
});

test("a service-specific env var is real configuration evidence", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({ dependencies: {} }),
      ".env.example": "POSTGRES_HOST=db\nREDIS_URL=redis://cache\n",
    },
    OPTS,
  );
  const deps = suggestDependenciesFromAnalysis(a);
  assert.equal(deps.postgres, "detected");
  assert.equal(deps.redis, "detected");
  assert.equal(deps.mysql, "not_detected");
});

test("a well-known service port alone is weak evidence, not an active dependency", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({ dependencies: {} }),
      "docker-compose.yml":
        "services:\n  db:\n    image: postgres:16\n    ports:\n      - '5432:5432'\n",
    },
    OPTS,
  );
  assert.equal(suggestDependenciesFromAnalysis(a).postgres, "unknown");
});

test("a bare DATABASE_URL is ambiguous, so Unknown rather than a guess", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({ dependencies: {} }),
      ".env.example": "DATABASE_URL=\n",
    },
    OPTS,
  );
  const deps = suggestDependenciesFromAnalysis(a);
  // DATABASE_URL does not say which engine — claiming Postgres would be a
  // fabrication, and so would claiming MySQL.
  assert.equal(deps.postgres, "unknown");
  assert.equal(deps.mysql, "unknown");
});

test("dependency detection is skipped entirely when analysis is unavailable", () => {
  const a = unavailableAnalysis(OPTS, "Private repository.");
  assert.deepEqual(suggestDependenciesFromAnalysis(a), {});
});

// ---------------------------------------------------------------------------
// Runtime — dev / build / production start must stay separate and evidenced
// ---------------------------------------------------------------------------

test("dev, build and start come from real package.json scripts, kept distinct", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({
        dependencies: { next: "14.0.0" },
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
        },
      }),
      "package-lock.json": "{}",
    },
    OPTS,
  );
  const r = suggestRuntimeFromAnalysis(a);
  assert.equal(r.devCommand, "npm run dev");
  assert.equal(r.devCommandProvenance, "detected");
  assert.equal(r.buildCommand, "npm run build");
  assert.equal(r.startCommand, "npm start");
  // The core SRE requirement: a dev server is never the production start.
  assert.notEqual(r.startCommand, r.devCommand);
});

test("script invocation follows the detected package manager", () => {
  const yarn = analyzeFileMap(
    {
      "package.json": JSON.stringify({
        dependencies: { express: "4.0.0" },
        scripts: { start: "node server.js", dev: "node --watch server.js" },
      }),
      "yarn.lock": "",
    },
    OPTS,
  );
  assert.equal(suggestRuntimeFromAnalysis(yarn).startCommand, "yarn start");
  assert.equal(suggestRuntimeFromAnalysis(yarn).devCommand, "yarn dev");

  const pnpm = analyzeFileMap(
    {
      "package.json": JSON.stringify({
        dependencies: { express: "4.0.0" },
        scripts: { start: "node server.js" },
      }),
      "pnpm-lock.yaml": "",
    },
    OPTS,
  );
  assert.equal(suggestRuntimeFromAnalysis(pnpm).startCommand, "pnpm start");
});

test("no scripts means no commands — Python start is never fabricated", () => {
  const a = analyzeFileMap(
    { "requirements.txt": "fastapi==0.110\nuvicorn[standard]\n", "app.py": "app = 1" },
    OPTS,
  );
  const r = suggestRuntimeFromAnalysis(a);
  // The old preset invented "uvicorn app:app --host 0.0.0.0 --port 8000",
  // including a module name that was never read.
  assert.equal(r.startCommand, undefined);
  assert.equal(r.buildCommand, undefined);
  assert.equal(r.devCommand, undefined);
  assert.equal(r.runtime, "Python");
  assert.equal(r.runtimeProvenance, "detected");
});

test("a Go repository gets no invented ./api start command", () => {
  const a = analyzeFileMap({ "go.mod": "module example\n\ngo 1.23\n", "main.go": "package main" }, OPTS);
  const r = suggestRuntimeFromAnalysis(a);
  assert.equal(r.startCommand, undefined);
  assert.equal(r.buildCommand, undefined);
  assert.equal(r.runtime, "Go");
});

test("runtime never claims a version the repository did not state", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "package-lock.json": "{}",
    },
    OPTS,
  );
  const r = suggestRuntimeFromAnalysis(a);
  // Previously hardcoded to "Node.js 20".
  assert.equal(r.runtime, "Node.js");
  assert.ok(!/\d/.test(r.runtime ?? ""), "no invented version suffix");
});

test("an unreadable repository yields no runtime suggestions", () => {
  assert.deepEqual(
    suggestRuntimeFromAnalysis(unavailableAnalysis(OPTS, "No URL.")),
    {},
  );
  assert.deepEqual(suggestRuntimeFromAnalysis(null), {});
});

// ---------------------------------------------------------------------------
// Health — only an evidenced endpoint is offered
// ---------------------------------------------------------------------------

test("a detected health route fills the endpoint", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({ dependencies: { express: "4.0.0" } }),
      "src/api/health.ts": 'app.get("/api/health", h);',
    },
    OPTS,
  );
  const h = suggestHealthFromAnalysis(a);
  assert.equal(h.method, "http");
  assert.equal(h.endpoint, "/api/health");
});

test("an unclassified exposed port suggests no endpoint and no port check", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({ dependencies: { express: "4.0.0" } }),
      Dockerfile: "FROM node:20\nEXPOSE 8080\n",
    },
    OPTS,
  );
  assert.deepEqual(suggestHealthFromAnalysis(a), {});
});

test("no evidence at all suggests nothing", () => {
  const a = analyzeFileMap({ "package.json": JSON.stringify({ dependencies: {} }) }, OPTS);
  assert.deepEqual(suggestHealthFromAnalysis(a), {});
});

test("a fresh wizard has NO pre-filled health endpoint", () => {
  // Regression: emptyWizardState shipped "/api/health", which the user could
  // not distinguish from a detected value.
  assert.equal(emptyWizardState("d").health.endpoint, "");
});

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

test("deployment analysis offers options but never selects a strategy", () => {
  const dockerOnly = analyzeFileMap(
    { "package.json": JSON.stringify({ dependencies: {} }), Dockerfile: "FROM node:20" },
    OPTS,
  );
  const dockerOptions = deploymentOptionsFromAnalysis(dockerOnly);
  assert.equal(dockerOptions.find((option) => option.strategy === "dockerfile")?.detected, true);

  const composeAndDocker = analyzeFileMap(
    {
      "package.json": JSON.stringify({ dependencies: {} }),
      Dockerfile: "FROM node:20",
      "docker-compose.yml": "services:\n  web:\n    build: .\n",
    },
    OPTS,
  );
  const detected = deploymentOptionsFromAnalysis(composeAndDocker)
    .filter((option) => option.detected)
    .map((option) => option.strategy)
    .sort();
  assert.deepEqual(detected, ["compose", "dockerfile"]);

  const nothing = analyzeFileMap({ "package.json": JSON.stringify({ dependencies: {} }) }, OPTS);
  assert.equal(deploymentOptionsFromAnalysis(nothing).some((option) => option.detected), false);
});