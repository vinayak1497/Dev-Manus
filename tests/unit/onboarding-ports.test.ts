/**
 * Semantic port regression tests.
 *
 * A port number is evidence, not a conclusion. These fixtures prove that
 * Service ports, NodePorts, metrics listeners, and gRPC listeners remain
 * visible without ever becoming the application HTTP port.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFileMap } from "../../lib/onboarding/analyze";
import type { PortFinding } from "../../lib/onboarding/types";

const OPTS = { provider: "github" as const, owner: "org", repo: "repo", branch: "main" };

function roles(findings: PortFinding[]): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const finding of findings) {
    out[finding.port] = [...(out[finding.port] ?? []), finding.role];
  }
  return out;
}

const DEPLOYMENT = `kind: Deployment
spec:
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        ports:
        - name: http
          containerPort: 9898
        - name: http-metrics
          containerPort: 9797
        - name: grpc
          containerPort: 9999
`;

const SERVICE = `kind: Service
spec:
  selector:
    app: web
  ports:
  - name: http
    port: 80
    targetPort: http
`;

test("1. an explicitly named application container port is selected", () => {
  const a = analyzeFileMap({ "k8s/deployment.yaml": DEPLOYMENT }, OPTS);
  assert.equal(a.applicationPort.selected.value, 9898);
  assert.equal(a.applicationPort.selected.provenance, "detected");
  assert.equal(a.applicationPort.ambiguous, false);
});

test("2. Service port 80 is access configuration; targetPort 9898 is the application", () => {
  const a = analyzeFileMap({ "k8s/deployment.yaml": DEPLOYMENT, "k8s/service.yaml": SERVICE }, OPTS);
  assert.equal(a.applicationPort.selected.value, 9898);
  const byPort = roles(a.portFindings);
  assert.ok(byPort[80].includes("service"), `80 is service access, got ${byPort[80]}`);
  assert.ok(!byPort[80].includes("application_http"), "80 never becomes the application port");
  assert.ok(byPort[9898].includes("application_http"));
});

test("3. NodePort, Service port, and targetPort are classified separately", () => {
  const a = analyzeFileMap(
    {
      "k8s/deployment.yaml": DEPLOYMENT,
      "k8s/service.yaml": `kind: Service
spec:
  type: NodePort
  selector:
    app: web
  ports:
  - name: http
    port: 80
    targetPort: 9898
    nodePort: 30080
`,
    },
    OPTS,
  );
  const byPort = roles(a.portFindings);
  assert.ok(byPort[30080].includes("node_port"));
  assert.ok(byPort[80].includes("service"));
  assert.ok(byPort[9898].includes("application_http"));
  assert.equal(a.applicationPort.selected.value, 9898);
});

test("4. a named targetPort resolves through the workload container name", () => {
  const a = analyzeFileMap({ "k8s/deployment.yaml": DEPLOYMENT, "k8s/service.yaml": SERVICE }, OPTS);
  const target = a.portFindings.find(
    (finding) => finding.port === 9898 && finding.evidence.evidenceType === "service_target",
  );
  assert.ok(target, "named targetPort produces target evidence");
  assert.match(target?.evidence.explanation ?? "", /resolves to container port 9898/);
});

test("5. metrics and gRPC listeners are visible but not application ports", () => {
  const a = analyzeFileMap({ "k8s/deployment.yaml": DEPLOYMENT }, OPTS);
  const byPort = roles(a.portFindings);
  assert.ok(byPort[9797].includes("metrics"));
  assert.ok(byPort[9999].includes("grpc"));
  assert.notEqual(a.applicationPort.selected.value, 9797);
  assert.notEqual(a.applicationPort.selected.value, 9999);
});

test("6. equally strong application candidates stay ambiguous instead of guessing", () => {
  const a = analyzeFileMap(
    {
      "k8s/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: api
        ports:
        - name: http
          containerPort: 8080
`,
      "other/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: worker
        ports:
        - name: http
          containerPort: 9090
`,
    },
    OPTS,
  );
  // Both unnamed-service container ports have identical medium evidence: there
  // is no material reason to prefer either one.
  assert.equal(a.applicationPort.selected.value, null);
  assert.equal(a.applicationPort.ambiguous, true);
  assert.ok(a.applicationPort.alternatives.length >= 2);
});

test("7. a common framework port does not override strong deployment evidence", () => {
  const a = analyzeFileMap(
    {
      "k8s/deployment.yaml": DEPLOYMENT,
      "compose.yaml": `services:
  frontend:
    build: .
    command: ./app
    ports:
    - "3000:3000"
`,
    },
    OPTS,
  );
  assert.equal(a.applicationPort.selected.value, 9898);
  assert.ok(a.portFindings.some((finding) => finding.port === 3000));
});
