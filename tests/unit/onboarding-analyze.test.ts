/**
 * Repository analysis tests — detection reports ONLY what files show.
 * Nothing is guessed: absent files are `not_detected`, never fabricated.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeFileMap,
  unavailableAnalysis,
} from "../../lib/onboarding/analyze";

const OPTS = { provider: "github" as const, owner: "org", repo: "repo", branch: "main" };

test("detects Next.js + Dockerfile + postgres from real files", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({
        dependencies: { next: "14.0.0", react: "18.0.0", pg: "8.0.0" },
        scripts: { start: "next start", build: "next build" },
      }),
      "package-lock.json": "{}",
      Dockerfile: "FROM node:20\nEXPOSE 3000\nCMD [\"npm\",\"start\"]",
      "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n",
      ".env.example": "DATABASE_URL=\nAPI_KEY=\n# comment\n",
      "src/app/api/health/route.ts": 'export async function GET() { return Response.json({ok:true}) } // "/api/health"',
    },
    OPTS,
  );
  assert.equal(a.status, "ready");
  assert.equal(a.framework.value, "Next.js");
  assert.equal(a.framework.provenance, "detected");
  assert.equal(a.language.value, "Node.js");
  assert.equal(a.packageManager.value, "npm");
  assert.equal(a.dockerfile.value, true);
  assert.ok(
    a.portFindings.some((finding) => finding.port === 3000 && finding.evidence.sourcePath === "Dockerfile"),
    "EXPOSE port observed with its source",
  );
  assert.equal(a.applicationPort.selected.value, null, "EXPOSE alone does not identify the application listener");
  assert.ok(a.healthEndpoints.value?.map((finding) => finding.path).includes("/api/health"));
  assert.ok(a.envVarNames.includes("DATABASE_URL"));
  assert.ok(a.envVarNames.includes("API_KEY"));
  assert.ok(!a.envVarNames.includes("#"), "comments are not names");
  assert.ok(a.dependencies.includes("pg"));
});

test("empty file map detects nothing — never invents a stack", () => {
  const a = analyzeFileMap({}, OPTS);
  assert.equal(a.framework.value, null);
  assert.equal(a.framework.provenance, "not_detected");
  assert.equal(a.language.value, null);
  assert.equal(a.dockerfile.value, null);
  assert.equal(a.dockerfile.provenance, "not_detected");
  assert.deepEqual(a.portFindings, []);
  assert.deepEqual(a.dependencies, []);
  assert.deepEqual(a.entryPoints, []);
});

test("detects Python FastAPI without claiming Node", () => {
  const a = analyzeFileMap(
    {
      "requirements.txt": "fastapi==0.110\nuvicorn[standard]\n",
      "app.py": "app = FastAPI()",
    },
    OPTS,
  );
  assert.equal(a.framework.value, "FastAPI");
  assert.equal(a.language.value, "Python");
  assert.equal(a.framework.provenance, "detected");
});

test("detects compose, kubernetes, helm, and CI presence", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({ dependencies: { express: "4.0.0" } }),
      "docker-compose.yml": "services:\n  redis:\n    image: redis:7\n    ports:\n      - '6379:6379'\n",
      "deployment.yaml": "kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - ports:\n        - containerPort: 8080\n",
      "Chart.yaml": "apiVersion: v2\nname: app\n",
      ".github/workflows/": null,
      ".github/workflows/ci.yml": null,
    },
    OPTS,
  );
  assert.equal(a.compose.value, true);
  assert.equal(a.kubernetes.value, true);
  assert.equal(a.helm.value, true);
  assert.ok(a.ci.includes("GitHub Actions"));
  assert.ok(
    a.portFindings.some((finding) => finding.port === 8080 && finding.role === "unknown"),
    "a bare container port is observed without becoming the application port",
  );
  assert.equal(a.applicationPort.selected.value, null);
});

test("env example parsing reads NAMES only", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({ dependencies: {} }),
      ".env.example": "export DATABASE_HOST=db\nPORT=5432\nEMPTY=\n",
    },
    OPTS,
  );
  assert.ok(a.envVarNames.includes("DATABASE_HOST"));
  assert.ok(a.envVarNames.includes("PORT"));
  assert.ok(a.envVarNames.includes("EMPTY"));
});

test("unavailable analysis marks everything unavailable with a reason", () => {
  const a = unavailableAnalysis(OPTS, "Private repo — manual path.");
  assert.equal(a.status, "unavailable");
  assert.equal(a.reason, "Private repo — manual path.");
  assert.equal(a.framework.provenance, "unavailable");
  assert.equal(a.language.provenance, "unavailable");
  assert.equal(a.reachable, false);
});
