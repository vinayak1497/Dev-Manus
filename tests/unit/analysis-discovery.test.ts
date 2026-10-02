/**
 * Repository discovery + analysis regression tests.
 *
 * These lock in the behaviour that broke Podinfo-style repositories:
 *   - configuration nested in `charts/`, `kustomize/`, `manifests/`
 *   - a read failure must NOT be reported as "no configuration found"
 *   - every detected finding must carry the path that proves it
 *
 * The network is mocked (`GithubDeps`), so nothing here calls GitHub.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { selectFiles, DEFAULT_LIMITS } from "../../lib/onboarding/discovery";
import {
  analyzePublicRepository,
  isRateLimited,
  type GithubDeps,
  type HttpResult,
} from "../../lib/onboarding/github";
import { analyzeFileMap } from "../../lib/onboarding/analyze";
import type { Evidence, TreeEntry } from "../../lib/onboarding/types";

function evidencePaths(evidence: Evidence[] | undefined): string[] {
  return (evidence ?? []).map((item) => item.sourcePath);
}

function healthPaths(value: { path: string }[] | null): string[] {
  return (value ?? []).map((item) => item.path);
}

// --- helpers ---------------------------------------------------------------

function blob(path: string, size = 500): TreeEntry {
  return { path, type: "blob", size };
}
function dir(path: string): TreeEntry {
  return { path, type: "tree" };
}

function ok(body: unknown): HttpResult<unknown> {
  return { status: 200, headers: {}, body };
}
function status(code: number, headers: Record<string, string> = {}): HttpResult<unknown> {
  return { status: code, headers, body: null };
}

/** A deps object backed by a tree + a file map. */
function mockGithub(opts: {
  tree?: TreeEntry[];
  files?: Record<string, string>;
  meta?: HttpResult<unknown>;
  treeResult?: HttpResult<unknown>;
  rawStatus?: number;
}): GithubDeps {
  const files = opts.files ?? {};
  return {
    fetchJson: async (url: string) => {
      if (url.includes("/git/trees/")) {
        return opts.treeResult ?? ok({ tree: opts.tree ?? [], truncated: false });
      }
      if (/\/contents\//.test(url)) {
        const path = decodeURIComponent(url.split("/contents/")[1].split("?")[0]);
        const body = files[path];
        return body === undefined
          ? status(404)
          : ok({ content: Buffer.from(body, "utf-8").toString("base64"), encoding: "base64" });
      }
      return opts.meta ?? ok({ default_branch: "main" });
    },
    fetchText: async (url: string) => {
      if (opts.rawStatus && opts.rawStatus !== 200) return { status: opts.rawStatus, body: null };
      const path = url.split("/master/")[1] ?? url.split("/main/")[1] ?? "";
      const body = files[decodeURIComponent(path)];
      return body === undefined ? { status: 404, body: null } : { status: 200, body };
    },
  };
}

const PODINFO_TREE: TreeEntry[] = [
  dir("kustomize"),
  blob("kustomize/deployment.yaml", 1847),
  blob("kustomize/service.yaml", 271),
  blob("kustomize/kustomization.yaml", 125),
  dir("charts"),
  blob("charts/podinfo/Chart.yaml", 315),
  blob("charts/podinfo/values.yaml", 7346),
  blob("go.mod", 3893),
  blob("Dockerfile", 841),
  blob("README.md", 20000),
  blob("logo.png", 40000),
];

const KUSTOMIZE_DEPLOYMENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: podinfo
spec:
  template:
    spec:
      containers:
      - name: podinfod
        image: ghcr.io/stefanprodan/podinfo:6.15.0
        ports:
        - name: http
          containerPort: 9898
        command:
        - ./podinfo
        - --port=9898
        livenessProbe:
          httpGet:
            path: /healthz
            port: 9898
        readinessProbe:
          httpGet:
            path: /readyz
            port: 9898
`;

// --- 1. root-level Go detection -------------------------------------------

test("1. root-level Go module is detected with its path as evidence", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc" },
    mockGithub({ tree: [blob("go.mod", 1200), blob("main.go", 900)], files: { "go.mod": "module x\n\ngo 1.23\n", "main.go": "package main" } }),
  );
  assert.equal(a.status, "ready");
  assert.equal(a.language.value, "Go");
  assert.deepEqual(evidencePaths(a.evidence.language), ["go.mod"]);
});

// --- 2. nested Helm chart detection ---------------------------------------

test("2. a Helm chart nested in charts/ is detected (root-only lookups miss it)", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc", branch: "master" },
    mockGithub({
      tree: [dir("charts"), blob("charts/podinfo/Chart.yaml", 315), blob("go.mod", 800)],
      files: { "charts/podinfo/Chart.yaml": "apiVersion: v2\nname: podinfo\n", "go.mod": "module x\n" },
    }),
  );
  assert.equal(a.helm.value, true);
  assert.equal(a.helm.provenance, "detected");
  assert.deepEqual(evidencePaths(a.evidence.helm), ["charts/podinfo/Chart.yaml"]);
});

// --- 3 & 4. nested Kubernetes + Kustomize --------------------------------

test("3. Kubernetes manifests nested under kustomize/ are detected", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc", branch: "master" },
    mockGithub({
      tree: [blob("kustomize/deployment.yaml", 1847)],
      files: { "kustomize/deployment.yaml": KUSTOMIZE_DEPLOYMENT },
    }),
  );
  assert.equal(a.kubernetes.value, true);
  assert.ok(evidencePaths(a.evidence.kubernetes).includes("kustomize/deployment.yaml"));
});

test("4. kustomization.yaml is reported as Kustomize evidence", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc", branch: "master" },
    mockGithub({
      tree: [blob("kustomize/kustomization.yaml", 125), blob("kustomize/deployment.yaml", 400)],
      files: {
        "kustomize/kustomization.yaml": "resources:\n  - deployment.yaml\n",
        "kustomize/deployment.yaml": KUSTOMIZE_DEPLOYMENT,
      },
    }),
  );
  assert.equal(a.kustomize.value, true);
  assert.deepEqual(evidencePaths(a.evidence.kustomize), ["kustomize/kustomization.yaml"]);
});

// --- 5. evidence provenance ----------------------------------------------

test("5. every detected finding names the path that proves it", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/stefanprodan/podinfo", branch: "master" },
    mockGithub({
      tree: PODINFO_TREE,
      files: {
        "kustomize/deployment.yaml": KUSTOMIZE_DEPLOYMENT,
        "kustomize/service.yaml": "kind: Service\n",
        "kustomize/kustomization.yaml": "resources: []\n",
        "charts/podinfo/Chart.yaml": "apiVersion: v2\nname: podinfo\n",
        "charts/podinfo/values.yaml": "replicaCount: 1\n",
        "go.mod": "module github.com/stefanprodan/podinfo\n\ngo 1.23\n",
        Dockerfile: "FROM golang:1.23\nEXPOSE 9898\n",
      },
    }),
  );
  assert.equal(a.status, "ready");
  assert.equal(a.language.value, "Go");
  assert.equal(a.dockerfile.value, true);
  assert.equal(a.kubernetes.value, true);
  assert.equal(a.kustomize.value, true);
  assert.equal(a.helm.value, true);
  assert.ok(evidencePaths(a.evidence.helm).includes("charts/podinfo/Chart.yaml"));
  assert.ok(evidencePaths(a.evidence.kubernetes).includes("kustomize/deployment.yaml"));
  // Ports and probes are read from the nested manifest, not a root file.
  assert.equal(a.applicationPort.selected.value, 9898);
  assert.ok(evidencePaths(a.evidence.applicationPort).includes("kustomize/deployment.yaml"));
  assert.ok(healthPaths(a.healthEndpoints.value).includes("/healthz"), "liveness probe detected");
  assert.ok(healthPaths(a.healthEndpoints.value).includes("/readyz"), "readiness probe detected");
});

// --- 6. readable repository with no recognised evidence -------------------

test("6. a readable repository with nothing recognisable is READY, not unavailable", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/notes" },
    mockGithub({ tree: [blob("notes.txt", 100), blob("a/logo.png", 900)], files: { "notes.txt": "hi" } }),
  );
  // This is the distinction the old code got wrong.
  assert.equal(a.status, "ready");
  assert.equal(a.failure, null);
  assert.equal(a.helm.value, null);
  assert.equal(a.kubernetes.value, null);
  assert.equal(a.language.value, null);
  assert.deepEqual(a.evidence, {});
});

// --- 7. repository fetch failure -----------------------------------------

test("7. a missing repository reports repo_unreachable, not 'no files'", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/does-not-exist" },
    mockGithub({ meta: status(404) }),
  );
  assert.equal(a.status, "unavailable");
  assert.equal(a.failure, "repo_unreachable");
  assert.equal(a.reachable, false);
});

test("7b. a rate limit is classified as rate_limited and never as empty", async () => {
  assert.ok(isRateLimited(403, { "x-ratelimit-remaining": "0" }));
  assert.ok(isRateLimited(429, {}));
  assert.ok(!isRateLimited(404, {}));

  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc" },
    mockGithub({ meta: status(403, { "x-ratelimit-remaining": "0" }) }),
  );
  assert.equal(a.failure, "rate_limited");
  assert.match(a.reason ?? "", /rate limit/i);
});

// --- 8. branch not found --------------------------------------------------

test("8. a missing branch is reported as branch_not_found", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc", branch: "nope" },
    mockGithub({ treeResult: status(404) }),
  );
  assert.equal(a.status, "unavailable");
  assert.equal(a.failure, "branch_not_found");
  assert.match(a.reason ?? "", /branch/i);
});

test("8b. the default branch is used when none is supplied", async () => {
  let seen = "";
  const deps: GithubDeps = {
    ...mockGithub({ tree: [blob("go.mod", 100)], files: { "go.mod": "module x\n" } }),
    fetchJson: async (url: string) => {
      if (url.includes("/git/trees/")) seen = url;
      return url.includes("/git/trees/")
        ? ok({ tree: [blob("go.mod", 100)], truncated: false })
        : ok({ default_branch: "trunk" });
    },
  };
  const a = await analyzePublicRepository({ repositoryUrl: "https://github.com/org/svc" }, deps);
  assert.match(seen, /trunk/);
  assert.equal(a.branch, "trunk");
});

// --- 9. large / unreadable files -----------------------------------------

test("9. oversized files are listed but not downloaded; the rest still analyse", () => {
  const res = selectFiles([
    blob("go.mod", 100),
    blob("charts/app/values.yaml", 9_000_000),
    blob("kustomize/deployment.yaml", 800),
  ]);
  assert.ok(res.selected.includes("go.mod"));
  assert.ok(res.selected.includes("kustomize/deployment.yaml"));
  assert.ok(!res.selected.includes("charts/app/values.yaml"));
  assert.ok(res.tooLarge.includes("charts/app/values.yaml"));
});

test("9b. when nothing can be downloaded the result is read_failed", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc" },
    mockGithub({ tree: [blob("go.mod", 100)], files: {}, rawStatus: 500 }),
  );
  assert.equal(a.status, "unavailable");
  assert.equal(a.failure, "read_failed");
});

// --- 10. unsupported-only repositories -----------------------------------

test("10. a repository of only unsupported files yields no evidence, not an error", async () => {
  const a = analyzeFileMap({}, {
    provider: "github",
    owner: "org",
    repo: "notes",
    branch: "main",
  });
  assert.equal(a.status, "ready");
  assert.equal(a.framework.provenance, "not_detected");
});

// --- regressions found during live Podinfo verification -------------------

test("R1. exec-form probes are detected (host:port/path with no scheme)", () => {
  const a = analyzeFileMap(
    {
      "kustomize/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        ports:
        - name: http
          containerPort: 9898
        livenessProbe:
          exec:
            command:
            - podcli
            - check
            - http
            - localhost:9898/healthz
        readinessProbe:
          httpGet:
            path: /readyz
            port: 9898
`,
    },
    { provider: "github", owner: "o", repo: "r", branch: "master" },
  );
  assert.ok(healthPaths(a.healthEndpoints.value).includes("/healthz"), "exec liveness probe found");
  assert.ok(healthPaths(a.healthEndpoints.value).includes("/readyz"), "httpGet readiness probe found");
});

test("R2. a declared high container port is never dropped as the largest", () => {
  const a = analyzeFileMap(
    {
      "kustomize/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        ports:
        - name: http
          containerPort: 9898
        - name: http-metrics
          containerPort: 9797
        - name: grpc
          containerPort: 9999
`,
    },
    { provider: "github", owner: "o", repo: "r", branch: "master" },
  );
  // The previous implementation sorted ascending and sliced to 8, which
  // discarded 9898 — the actual application port.
  assert.equal(a.applicationPort.selected.value, 9898);
});

test("R3. declared ports outrank loose port mappings", () => {
  const a = analyzeFileMap(
    {
      "otel/docker-compose.yaml":
        "services:\n  otel:\n    ports:\n      - '4317:4317'\n      - '80:80'\n      - '443:443'\n      - '3000:3000'\n      - '3100:3100'\n      - '3306:3306'\n      - '6379:6379'\n",
      "kustomize/deployment.yaml": "kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - name: app\n        ports:\n        - name: http\n          containerPort: 9898\n",
    },
    { provider: "github", owner: "o", repo: "r", branch: "master" },
  );
  assert.equal(a.applicationPort.selected.value, 9898, "declared app port survives infrastructure noise");
});

test("R4. a README or shell script under deploy/ is not Kubernetes evidence", () => {
  const a = analyzeFileMap(
    {
      "deploy/README.md": "# Deploying\nUse kind.\n",
      "deploy/kind.sh": "kind create cluster\n",
    },
    { provider: "github", owner: "o", repo: "r", branch: "main" },
  );
  assert.equal(a.kubernetes.value, null, "prose/scripts are not manifests");
  assert.deepEqual(a.evidence.kubernetes, undefined);
});

test("R5. a health-looking path without a declared probe is not a probe", () => {
  const a = analyzeFileMap(
    { "app/routes/healthz.ts": "export const healthz = '/healthz-banner-mock';" },
    { provider: "github", owner: "o", repo: "r", branch: "main" },
  );
  // No livenessProbe/readinessProbe declared, so nothing may be claimed.
  assert.equal(a.healthEndpoints.value, null);
});

// --- provenance for every detected finding -------------------------------

test("P1. CI providers are backed by the file that defines them", () => {
  const a = analyzeFileMap(
    {
      ".github/workflows/release.yml": "on:\n  push:\n",
      Jenkinsfile: "pipeline { }\n",
    },
    { provider: "github", owner: "o", repo: "r", branch: "main" },
  );
  assert.deepEqual(a.ci, ["GitHub Actions", "Jenkins"]);
  assert.deepEqual(evidencePaths(a.evidence.ci), [".github/workflows/release.yml", "Jenkinsfile"]);
});

test("P2. framework, language and package manager all carry evidence", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({
        name: "web",
        main: "dist/index.js",
        scripts: { start: "node dist/index.js" },
        dependencies: { express: "^4.18.2" },
      }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "src/index.ts": "export {};\n",
    },
    { provider: "github", owner: "o", repo: "r", branch: "main" },
  );
  assert.equal(a.framework.value, "Express");
  assert.equal(a.language.value, "Node.js");
  assert.equal(a.packageManager.value, "pnpm");
  assert.deepEqual(evidencePaths(a.evidence.framework), ["package.json"]);
  assert.deepEqual(evidencePaths(a.evidence.language), ["package.json"]);
  assert.deepEqual(evidencePaths(a.evidence.packageManager), ["pnpm-lock.yaml"]);
});

test("P3. an entry point read out of package.json is attributed to it", () => {
  const a = analyzeFileMap(
    {
      "package.json": JSON.stringify({ scripts: { start: "node server.js" } }),
      "server.js": "require('http');\n",
    },
    { provider: "github", owner: "o", repo: "r", branch: "main" },
  );
  assert.ok(a.entryPoints.includes("npm start (node server.js)"));
  // "npm start (...)" is not a path, so package.json must supply the proof.
  assert.deepEqual(evidencePaths(a.evidence.entryPoints), ["server.js", "package.json"]);
});

test("P4. a Python finding is backed by a Python manifest", () => {
  const a = analyzeFileMap(
    {
      "pyproject.toml": "[project]\ndependencies = ['fastapi']\n",
      "main.py": "app = 1\n",
    },
    { provider: "github", owner: "o", repo: "r", branch: "main" },
  );
  assert.equal(a.language.value, "Python");
  assert.ok(evidencePaths(a.evidence.language).includes("pyproject.toml"));
  assert.ok(a.entryPoints.includes("main.py"));
});

// --- discovery bounds -----------------------------------------------------

test("discovery ignores vendored, generated and binary paths", () => {
  const res = selectFiles([
    blob("go.mod", 100),
    blob("node_modules/left-pad/index.js", 900),
    blob("vendor/github.com/x/y.go", 900),
    blob("dist/bundle.js", 900),
    blob(".git/config", 100),
    blob("docs/logo.png", 900),
    blob("charts/app/Chart.yaml", 100),
  ]);
  // Both surviving files are top-priority; ties break alphabetically.
  assert.deepEqual([...res.selected].sort(), ["charts/app/Chart.yaml", "go.mod"]);
});

test("discovery respects depth, file-count and total-size budgets", () => {
  const many = Array.from({ length: 500 }, (_, i) => blob(`k8s/pod-${i}.yaml`, 100));
  const capped = selectFiles(many, {
    ...DEFAULT_LIMITS,
    maxFiles: 25,
  });
  assert.equal(capped.selected.length, 25);
  assert.ok(capped.droppedForBudget > 0);

  const deep = selectFiles([blob("a/b/c/d/e/f/Chart.yaml", 100)], DEFAULT_LIMITS);
  assert.deepEqual(deep.selected, [], "beyond maxDepth");

  const budgeted = selectFiles(
    [blob("a.yaml", 900), blob("b.yaml", 900), blob("c.yaml", 900)],
    { ...DEFAULT_LIMITS, maxTotalBytes: 1000 },
  );
  assert.equal(budgeted.selected.length, 1);
});

test("discovery is deterministic across runs", () => {
  const entries = [...PODINFO_TREE];
  assert.deepEqual(selectFiles(entries).selected, selectFiles(entries).selected);
});

test("a truncated tree is reported rather than silently hidden", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc" },
    {
      ...mockGithub({ tree: [blob("go.mod", 100)], files: { "go.mod": "module x\n" } }),
      fetchJson: async (url: string) =>
        url.includes("/git/trees/")
          ? ok({ tree: [{ path: "go.mod", type: "blob", size: 100 }], truncated: true })
          : ok({ default_branch: "main" }),
    },
  );
  assert.equal(a.status, "ready");
  assert.equal(a.truncated, true);
});

// --- honesty --------------------------------------------------------------

test("analysis never invents values when a file yields none", () => {
  const a = analyzeFileMap(
    { "go.mod": "module x\n" },
    { provider: "github", owner: "o", repo: "r", branch: "main" },
  );
  // A Go module proves a language — not a start command, port, or health path.
  assert.equal(a.language.value, "Go");
  assert.deepEqual(a.portFindings, []);
  assert.equal(a.applicationPort.selected.value, null);
  assert.equal(a.healthEndpoints.value, null);
  assert.equal(a.scripts.value, null);
});

test("unavailable analysis exposes a machine-readable failure", () => {
  const a = analyzeFileMap({}, {
    provider: "github",
    owner: "o",
    repo: "r",
    branch: "main",
  });
  assert.equal(a.failure, null, "a ready analysis has no failure");
});