/**
 * Production/build/development command regression tests.
 *
 * Commands are deployment facts, not language guesses. A Go repository with
 * Kubernetes manifests must surface the container command — never `npm
 * start` — and stale detected commands must disappear when the repository
 * changes underneath them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFileMap } from "../../lib/onboarding/analyze";
import {
  applyAnalysisSuggestions,
  applyDeploymentStrategy,
} from "../../lib/onboarding/configuration";
import { emptyWizardState } from "../../lib/onboarding/types";

const OPTS = { provider: "github" as const, owner: "org", repo: "repo", branch: "main" };

const KUSTOMIZE_COMMAND = `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: podinfod
        command:
        - ./podinfo
        - --port=9898
        - --port-metrics=9797
`;

test("9. a Kubernetes container command becomes the production start", () => {
  const a = analyzeFileMap({ "kustomize/deployment.yaml": KUSTOMIZE_COMMAND }, OPTS);
  assert.equal(a.runtimeCommands.production.command, "./podinfo --port=9898 --port-metrics=9797");
  assert.equal(a.runtimeCommands.production.provenance, "detected");
  assert.equal(a.runtimeCommands.production.strategy, "kubernetes");
});

test("10. Dockerfile ENTRYPOINT and CMD become the production start", () => {
  const a = analyzeFileMap(
    { Dockerfile: 'FROM node:20\nENTRYPOINT ["docker-entrypoint.sh"]\nCMD ["node", "server.js"]' },
    OPTS,
  );
  assert.equal(a.runtimeCommands.production.command, "docker-entrypoint.sh node server.js");
  assert.equal(a.runtimeCommands.production.strategy, "dockerfile");
});

test("11. a locally built Compose service command becomes the production start", () => {
  const a = analyzeFileMap(
    {
      "compose.yaml": `services:
  api:
    build: .
    command: ./api --port 8080
`,
    },
    OPTS,
  );
  const production = a.productionCommands.find((candidate) => candidate.strategy === "compose");
  assert.equal(production?.command, "./api --port 8080");
});

test("12. a Go repository never receives npm start", () => {
  const a = analyzeFileMap({ "go.mod": "module example\n\ngo 1.23\n" }, OPTS);
  assert.equal(a.language.value, "Go");
  assert.equal(a.runtimeCommands.production.command, null);
  assert.ok(
    a.productionCommands.every((candidate) => !/\bnpm\b/i.test(candidate.command ?? "")),
    "no npm-derived production candidate",
  );
});

test("13. a Python repository never receives npm start", () => {
  const a = analyzeFileMap(
    { "requirements.txt": "fastapi==0.110\n", "app.py": "app = 1\n" },
    OPTS,
  );
  assert.equal(a.language.value, "Python");
  assert.equal(a.runtimeCommands.production.command, null);
});

test("14. an unknown production command stays Not detected", () => {
  const a = analyzeFileMap({ "go.mod": "module example\n\ngo 1.23\n" }, OPTS);
  assert.equal(a.runtimeCommands.production.provenance, "not_detected");
});

test("15. a stale detected npm start is cleared when the repository becomes Go", () => {
  const nodeAnalysis = analyzeFileMap(
    {
      "package.json": JSON.stringify({ scripts: { start: "node server.js" } }),
      "package-lock.json": "{}",
    },
    OPTS,
  );
  let state = applyAnalysisSuggestions(emptyWizardState("draft-commands"), nodeAnalysis);
  assert.equal(state.runtime.startCommand, "npm start");

  const goAnalysis = analyzeFileMap({ "go.mod": "module example\n\ngo 1.23\n" }, OPTS);
  state = applyAnalysisSuggestions(state, goAnalysis);
  assert.equal(state.runtime.startCommand, "");
  assert.equal(state.runtime.startProvenance, "not_detected");
});

test("changing to Helm refreshes detected production evidence without touching user edits", () => {
  const a = analyzeFileMap(
    {
      "kustomize/deployment.yaml": KUSTOMIZE_COMMAND,
      "charts/app/templates/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        command:
        - ./podinfo
        - --port={{ .Values.service.httpPort | default 9898 }}
`,
      "charts/app/values.yaml": "service:\n  httpPort: 9898\n",
    },
    OPTS,
  );
  let state = emptyWizardState("draft-commands-helm");
  state = applyAnalysisSuggestions(state, a);
  assert.match(state.runtime.startCommand, /--port=9898/);
  state = applyDeploymentStrategy(state, "helm", a);
  assert.equal(state.runtime.startCommand, "./podinfo --port=9898");
  assert.equal(state.runtime.startProvenance, "detected");

  state = {
    ...state,
    runtime: { ...state.runtime, startCommand: "custom start", startProvenance: "configured" },
  };
  state = applyDeploymentStrategy(state, "kubernetes", a);
  assert.equal(state.runtime.startCommand, "custom start");
  assert.equal(state.runtime.startProvenance, "configured");
});
