/**
 * Canonical configuration regression tests.
 *
 * Step 4, Review, persistence, and read-back must agree because they consume
 * the same canonical object. These tests walk that loop without a database by
 * JSON-round-tripping the canonical payload through the stored-config
 * normalizer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFileMap } from "../../lib/onboarding/analyze";
import {
  applyAnalysisSuggestions,
  applyDeploymentStrategy,
  buildCanonicalConfiguration,
  canonicalSubmitSections,
} from "../../lib/onboarding/configuration";
import { deploymentStrategyLabel } from "../../lib/onboarding/deployment";
import { normalizeStoredConfig } from "../../lib/onboarding/stored-config";
import {
  emptyWizardState,
  toSubmitPayload,
  type WizardState,
} from "../../lib/onboarding/types";
import { validateRuntime } from "../../lib/onboarding/validation";

const OPTS = { provider: "github" as const, owner: "org", repo: "repo", branch: "main" };

const FILES = {
  "go.mod": "module example\n\ngo 1.23\n",
  "kustomize/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
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
`,
  "kustomize/service.yaml": `kind: Service
spec:
  selector:
    app: missing
  ports:
  - name: http
    port: 80
    targetPort: 9898
`,
  "charts/app/Chart.yaml": "apiVersion: v2\nname: app\n",
  "charts/app/values.yaml": "service:\n  httpPort: 9898\n",
  "charts/app/templates/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        ports:
        - name: http
          containerPort: {{ .Values.service.httpPort | default 9898 }}
        command:
        - ./podinfo
        - --port={{ .Values.service.httpPort | default 9898 }}
`,
  "charts/app/templates/service.yaml": `kind: Service
spec:
  ports:
  - name: http
    port: 80
    targetPort: http
`,
  Dockerfile: 'FROM golang:1.23\nCMD ["./podinfo"]\n',
};

function analyzedHelmState(): WizardState {
  let state = emptyWizardState("draft-canonical");
  state = {
    ...state,
    basics: { name: "Podinfo AWS Runtime Demo", description: "", tags: [], environment: "Production" },
    repository: { url: "https://github.com/stefanprodan/podinfo", branch: "master", provider: "github", connection: "url_only" },
    health: {
      ...state.health,
      targetType: "external_url",
      targetUrl: "https://performer-delete-belfast-knows.trycloudflare.com",
      endpoint: "/",
      targetProvenance: "configured",
      endpointProvenance: "configured",
      methodProvenance: "configured",
    },
  };
  const analysis = analyzeFileMap(FILES, OPTS);
  state = applyAnalysisSuggestions(state, analysis);
  return applyDeploymentStrategy(state, "helm", analysis);
}

test("22. selecting Helm flows unchanged into the canonical Review value", () => {
  const state = analyzedHelmState();
  const canonical = buildCanonicalConfiguration(state);
  assert.equal(canonical.deployment.strategy, "helm");
  assert.equal(canonical.deployment.label, deploymentStrategyLabel("helm"));
  assert.equal(canonical.deployment.label, "Helm chart");
  assert.equal(canonical.runtime.startCommand, "./podinfo --port=9898");
  assert.equal(canonical.runtime.port, "9898");
  assert.equal(canonical.health.checkUrl, "https://performer-delete-belfast-knows.trycloudflare.com/");
});

test("23. selecting Kubernetes flows unchanged into the canonical Review value", () => {
  const analysis = analyzeFileMap(FILES, OPTS);
  let state = applyAnalysisSuggestions(emptyWizardState("draft-canonical-k8s"), analysis);
  state = applyDeploymentStrategy(state, "kubernetes", analysis);
  const canonical = buildCanonicalConfiguration(state);
  assert.equal(canonical.deployment.strategy, "kubernetes");
  assert.equal(canonical.deployment.label, "Kubernetes manifests");
  assert.equal(canonical.runtime.startCommand, "./podinfo --port=9898");
});

test("24. Review, payload, storage JSON, and read-back preserve the selection", () => {
  const state = analyzedHelmState();
  const canonical = buildCanonicalConfiguration(state);
  const payload = { ...toSubmitPayload(state), ...canonicalSubmitSections(state) };
  assert.equal(payload.deployment.strategy, canonical.deployment.strategy);
  assert.equal(payload.runtime.startCommand, canonical.runtime.startCommand);
  assert.equal(payload.health.targetUrl, "https://performer-delete-belfast-knows.trycloudflare.com");
  assert.equal(payload.health.endpoint, "/");

  // Simulate the JSONB storage round trip, then read it back.
  const stored = normalizeStoredConfig(
    {
      monitoring_status: "pending",
      branch: JSON.parse(JSON.stringify(payload.repository.branch)) as unknown,
      repository_provider: JSON.parse(JSON.stringify(payload.repository.provider)) as unknown,
      deployment: JSON.parse(JSON.stringify(payload.deployment)) as never,
      runtime: JSON.parse(JSON.stringify(payload.runtime)) as never,
      dependencies: JSON.parse(JSON.stringify(payload.dependencies)) as never,
      health: JSON.parse(JSON.stringify(payload.health)) as never,
    },
    [],
  );
  assert.equal(stored?.deployment?.strategy, "helm");
  assert.equal(stored?.runtime?.startCommand, "./podinfo --port=9898");
  assert.equal(stored?.runtime?.port, "9898");
  assert.equal(stored?.health?.targetUrl, "https://performer-delete-belfast-knows.trycloudflare.com");
  assert.equal(stored?.health?.endpoint, "/");
  assert.equal(stored?.health?.targetType, "external_url");
});

test("25. multiple detected deployment types never overwrite an explicit selection", () => {
  const analysis = analyzeFileMap(FILES, OPTS);
  let state = applyAnalysisSuggestions(emptyWizardState("draft-canonical-multi"), analysis);
  assert.equal(state.deployment.strategy, "");
  state = applyDeploymentStrategy(state, "helm", analysis);
  state = applyAnalysisSuggestions(state, analysis);
  assert.equal(state.deployment.strategy, "helm");
});

test("a user-configured production command keeps its provenance in Review", () => {
  const state = analyzedHelmState();
  const configured: WizardState = {
    ...state,
    runtime: { ...state.runtime, startCommand: "./podinfo --port=9898", startProvenance: "configured" },
  };
  const canonical = buildCanonicalConfiguration(configured);
  assert.equal(canonical.runtime.startCommand, "./podinfo --port=9898");
  assert.equal(canonical.runtime.startProvenance, "configured");
});

test("deployment-managed Kubernetes may leave production start empty", () => {
  const analysis = analyzeFileMap(
    { "k8s/deployment.yaml": "kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - name: app\n" },
    OPTS,
  );
  let state = applyAnalysisSuggestions(emptyWizardState("draft-managed"), analysis);
  state = applyDeploymentStrategy(state, "kubernetes", analysis);
  assert.equal(buildCanonicalConfiguration(state).runtime.startState, "deployment_managed");
  assert.deepEqual(validateRuntime(state), {});
});

test("a stale npm start is rejected against Go evidence", () => {
  const state = analyzedHelmState();
  const stale: WizardState = {
    ...state,
    runtime: { ...state.runtime, startCommand: "npm start", startProvenance: "configured" },
  };
  assert.match(validateRuntime(stale).startCommand ?? "", /JavaScript package manager/);
});
