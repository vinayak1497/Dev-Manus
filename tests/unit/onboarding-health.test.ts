/**
 * Health-model regression tests.
 *
 * Monitoring targets and endpoint paths are separate facts. Probe roles are
 * preserved: liveness and readiness are Kubernetes signals, while only an
 * application route is eligible to become the external functional check.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFileMap } from "../../lib/onboarding/analyze";
import { suggestedFunctionalEndpoint } from "../../lib/onboarding/health-evidence";
import {
  buildHealthCheckUrl,
  normalizeHealthPath,
  normalizeHealthTarget,
} from "../../lib/onboarding/health";
import { validateHealth } from "../../lib/onboarding/validation";
import { emptyWizardState } from "../../lib/onboarding/types";

const OPTS = { provider: "github" as const, owner: "org", repo: "repo", branch: "main" };

const PROBES = `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        livenessProbe:
          exec:
            command:
            - check
            - http
            - localhost:9898/healthz
        readinessProbe:
          httpGet:
            path: /readyz
            port: 9898
`;

test("health probes retain their Kubernetes roles", () => {
  const a = analyzeFileMap({ "k8s/deployment.yaml": PROBES }, OPTS);
  const findings = a.healthEndpoints.value ?? [];
  assert.deepEqual(
    findings.map((finding) => `${finding.role}:${finding.path}`),
    ["liveness:/healthz", "readiness:/readyz"],
  );
});

test("an application route is preferred over probe paths for external checks", () => {
  const a = analyzeFileMap(
    {
      "k8s/deployment.yaml": PROBES,
      "server.js": "app.get('/', home);\napp.get('/healthz', probe);\n",
    },
    OPTS,
  );
  assert.equal(suggestedFunctionalEndpoint(a.healthEndpoints.value ?? []), "/");
});

test("26. a target URL and root path join to exactly one slash", () => {
  assert.equal(
    buildHealthCheckUrl("https://tunnel.example.com/", "/").url,
    "https://tunnel.example.com/",
  );
});

test("27. a target URL and nested path preserve the path", () => {
  assert.equal(
    buildHealthCheckUrl("https://tunnel.example.com", "/healthz").url,
    "https://tunnel.example.com/healthz",
  );
});

test("28. a full URL is rejected in the path field", () => {
  const state = emptyWizardState("draft-health");
  state.health.targetUrl = "https://tunnel.example.com";
  state.health.endpoint = "https://tunnel.example.com/healthz";
  const errors = validateHealth(state);
  assert.match(errors.endpoint ?? "", /full URL/);
});

test("29. liveness and readiness remain different semantic roles", () => {
  const a = analyzeFileMap({ "k8s/deployment.yaml": PROBES }, OPTS);
  const roles = new Set((a.healthEndpoints.value ?? []).map((finding) => finding.role));
  assert.ok(roles.has("liveness"));
  assert.ok(roles.has("readiness"));
  assert.notEqual(
    a.healthEndpoints.value?.find((finding) => finding.role === "liveness")?.path,
    a.healthEndpoints.value?.find((finding) => finding.role === "readiness")?.path,
  );
});

test("30. a functional endpoint can be selected independently of probes", () => {
  const a = analyzeFileMap(
    {
      "k8s/deployment.yaml": PROBES,
      "server.js": "app.get('/api/info', info);\n",
    },
    OPTS,
  );
  assert.equal(suggestedFunctionalEndpoint(a.healthEndpoints.value ?? []), "/api/info");
});

test("target URLs reject credentials and non-HTTP schemes", () => {
  assert.match(normalizeHealthTarget("https://user:pass@example.com").error ?? "", /credentials/);
  assert.match(normalizeHealthTarget("ftp://example.com").error ?? "", /http/);
  assert.equal(normalizeHealthPath("/healthz").value, "/healthz");
});

test("Helm trimSuffix expressions preserve probe paths", () => {
  const a = analyzeFileMap(
    {
      "charts/app/values.yaml": "service:\n  httpPort: 9898\nprefix: /\n",
      "charts/app/templates/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        livenessProbe:
          exec:
            command:
            - check
            - http
            - localhost:{{ .Values.service.httpPort | default 9898 }}{{ trimSuffix "/" (.Values.prefix | default "/") }}/healthz
`,
    },
    OPTS,
  );
  assert.ok(
    (a.healthEndpoints.value ?? []).some((finding) => finding.role === "liveness" && finding.path === "/healthz"),
    "templated probe path resolves instead of truncating to /",
  );
});
