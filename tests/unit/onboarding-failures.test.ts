/**
 * Repository-analysis failure-shape regression tests.
 *
 * Unreachable, missing-branch, rate-limited, malformed, binary-only, and
 * multi-chart repositories are different operational outcomes. None of them
 * may be reported as an empty repository with no findings.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFileMap } from "../../lib/onboarding/analyze";
import {
  analyzePublicRepository,
  type GithubDeps,
  type HttpResult,
} from "../../lib/onboarding/github";
import type { TreeEntry } from "../../lib/onboarding/types";

const OPTS = { provider: "github" as const, owner: "org", repo: "repo", branch: "main" };

function blob(path: string, size = 500): TreeEntry {
  return { path, type: "blob", size };
}

function ok(body: unknown): HttpResult<unknown> {
  return { status: 200, headers: {}, body };
}

function mockGithub(tree: TreeEntry[], files: Record<string, string>): GithubDeps {
  return {
    fetchJson: async (url: string) => {
      if (url.includes("/git/trees/")) return ok({ tree, truncated: false });
      if (url.includes("/contents/")) {
        const path = decodeURIComponent(url.split("/contents/")[1].split("?")[0]);
        const body = files[path];
        return body === undefined
          ? { status: 404, headers: {}, body: null }
          : ok({ content: Buffer.from(body, "utf-8").toString("base64"), encoding: "base64" });
      }
      return ok({ default_branch: "main" });
    },
    fetchText: async (url: string) => {
      const path = url.split("/main/")[1] ?? "";
      const body = files[decodeURIComponent(path)];
      return body === undefined ? { status: 404, body: null } : { status: 200, body };
    },
  };
}

test("31. a missing branch is branch_not_found", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc", branch: "missing" },
    {
      ...mockGithub([], {}),
      fetchJson: async (url: string) =>
        url.includes("/git/trees/") ? { status: 404, headers: {}, body: null } : ok({ default_branch: "main" }),
    },
  );
  assert.equal(a.failure, "branch_not_found");
});

test("32. a missing repository is repo_unreachable", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/missing" },
    {
      ...mockGithub([], {}),
      fetchJson: async (url: string) =>
        url.includes("/repos/org/missing") && !url.includes("/git/trees/")
          ? { status: 404, headers: {}, body: null }
          : ok({ default_branch: "main" }),
    },
  );
  assert.equal(a.failure, "repo_unreachable");
});

test("33. an exhausted quota is rate_limited", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/svc" },
    {
      ...mockGithub([], {}),
      fetchJson: async () => ({ status: 403, headers: { "x-ratelimit-remaining": "0" }, body: null }),
    },
  );
  assert.equal(a.failure, "rate_limited");
});

test("34. an empty repository is ready with no findings", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/empty" },
    mockGithub([], {}),
  );
  assert.equal(a.status, "ready");
  assert.equal(a.failure, null);
});

test("35. nested-only configuration is analyzed successfully", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/nested" },
    mockGithub([blob("charts/app/Chart.yaml", 100)], {
      "charts/app/Chart.yaml": "apiVersion: v2\nname: app\n",
    }),
  );
  assert.equal(a.status, "ready");
  assert.equal(a.helm.value, true);
});

test("36. an oversized manifest does not fail the whole analysis", async () => {
  const a = await analyzePublicRepository(
    { repositoryUrl: "https://github.com/org/large" },
    mockGithub([blob("go.mod", 100), blob("charts/app/values.yaml", 9_000_000)], {
      "go.mod": "module example\n\ngo 1.23\n",
    }),
  );
  assert.equal(a.status, "ready");
  assert.equal(a.language.value, "Go");
});

test("37. malformed YAML is unknown evidence, not a failed analysis", () => {
  const a = analyzeFileMap(
    {
      "go.mod": "module example\n\ngo 1.23\n",
      "k8s/deployment.yaml": "kind: Deployment\n  bad indent\n\t-tab: true\n",
    },
    OPTS,
  );
  assert.equal(a.status, "ready");
  assert.equal(a.language.value, "Go");
  assert.equal(a.kubernetes.value, null);
});

test("38. malformed JSON is unknown evidence, not a failed analysis", () => {
  const a = analyzeFileMap({ "package.json": '{"dependencies": {"next":' }, OPTS);
  assert.equal(a.status, "ready");
  assert.equal(a.framework.value, null);
  assert.equal(a.language.value, null);
  assert.equal(a.scripts.value, null);
});

test("39. binary-only content yields no findings and no error", () => {
  const a = analyzeFileMap({ "logo.png": null, "notes.txt": "hello" }, OPTS);
  assert.equal(a.status, "ready");
  assert.equal(a.failure, null);
  assert.deepEqual(a.portFindings, []);
});

test("40. multiple Helm charts are all reported", () => {
  const a = analyzeFileMap(
    {
      "charts/frontend/Chart.yaml": "apiVersion: v2\nname: frontend\n",
      "charts/backend/Chart.yaml": "apiVersion: v2\nname: backend\n",
    },
    OPTS,
  );
  assert.equal(a.helm.value, true);
  assert.deepEqual(
    (a.evidence.helm ?? []).map((item) => item.sourcePath).sort(),
    ["charts/backend/Chart.yaml", "charts/frontend/Chart.yaml"],
  );
});

test("unsupported hosts and missing URLs keep their own failure shapes", async () => {
  const unsupported = await analyzePublicRepository(
    { repositoryUrl: "https://example.com/org/svc" },
    mockGithub([], {}),
  );
  assert.equal(unsupported.failure, "unsupported_host");
  const missing = await analyzePublicRepository({ repositoryUrl: "" }, mockGithub([], {}));
  assert.equal(missing.failure, "no_url");
});
