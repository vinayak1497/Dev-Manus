/**
 * Provenance regression tests.
 *
 * Auto-detected means traceable. Unknown means undecided. User configured
 * means explicitly overridden. These are three different states and the
 * canonical configuration must preserve all three.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFileMap } from "../../lib/onboarding/analyze";
import { applyAnalysisSuggestions } from "../../lib/onboarding/configuration";
import { emptyWizardState } from "../../lib/onboarding/types";
import { dependencyStatusLabel } from "../../lib/onboarding/dependencies";
import type { Evidence } from "../../lib/onboarding/types";

const OPTS = { provider: "github" as const, owner: "org", repo: "repo", branch: "main" };

function paths(evidence: Evidence[] | undefined): string[] {
  return (evidence ?? []).map((item) => item.sourcePath);
}

const FILES = {
  "package.json": JSON.stringify({
    dependencies: { express: "4.18.2", pg: "8.0.0" },
    scripts: { start: "node server.js", build: "npm run build", dev: "node --watch server.js" },
  }),
  "package-lock.json": "{}",
  "server.js": "require('http');\n",
  Dockerfile: 'FROM node:20\nEXPOSE 3000\nCMD ["npm", "start"]\n',
};

test("41. every Auto-detected finding has evidence", () => {
  const a = analyzeFileMap(FILES, OPTS);
  assert.equal(a.framework.provenance, "detected");
  assert.ok(paths(a.evidence.framework).length > 0);
  assert.ok(paths(a.evidence.language).length > 0);
  assert.ok(paths(a.evidence.packageManager).length > 0);
  assert.ok(paths(a.evidence.dockerfile).length > 0);
  assert.ok(paths(a.evidence.entryPoints).length > 0);
  assert.ok(paths(a.evidence.runtimeCommandProduction).length > 0);
  assert.ok(paths(a.evidence.productionCommands).length > 0);
  assert.ok(
    a.productionCommands
      .filter((command) => command.provenance === "detected")
      .every((command) => command.sourcePath && command.confidence && command.explanation),
    "every detected production command names its source",
  );
});

test("42. a user-configured finding does not claim Auto-detected", () => {
  const a = analyzeFileMap(FILES, OPTS);
  let state = applyAnalysisSuggestions(emptyWizardState("draft-provenance"), a);
  state = {
    ...state,
    runtime: { ...state.runtime, startCommand: "node server.js", startProvenance: "configured" },
  };
  state = applyAnalysisSuggestions(state, a);
  assert.equal(state.runtime.startCommand, "node server.js");
  assert.equal(state.runtime.startProvenance, "configured");
  assert.equal(a.runtimeCommands.production.provenance, "detected");
});

test("43. unknown does not render as Not detected", () => {
  const a = analyzeFileMap(FILES, OPTS);
  assert.equal(a.dependencyFindings.postgres.status, "unknown");
  assert.equal(dependencyStatusLabel("unknown"), "Not confirmed");
  assert.equal(dependencyStatusLabel("not_detected"), "Not detected");
});

test("44. every detected production command has source evidence", () => {
  const a = analyzeFileMap(FILES, OPTS);
  const detected = a.productionCommands.filter((command) => command.provenance === "detected");
  assert.ok(detected.length > 0);
  for (const command of detected) {
    assert.ok(command.sourcePath, "source path");
    assert.ok(command.confidence, "confidence");
    assert.ok(command.explanation, "explanation");
  }
});

test("45. the primary port has source evidence", () => {
  const a = analyzeFileMap(
    {
      "k8s/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: web
        ports:
        - name: http
          containerPort: 9898
`,
    },
    OPTS,
  );
  assert.equal(a.applicationPort.selected.value, 9898);
  assert.ok(paths(a.evidence.applicationPort).includes("k8s/deployment.yaml"));
});
