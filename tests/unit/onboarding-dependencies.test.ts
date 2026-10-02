/**
 * Dependency-tier regression tests.
 *
 * Presence is not use. A port number, driver, or optional chart can only make
 * a dependency "Not confirmed"; only configuration that ties the service to
 * the application workload marks it "Detected".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFileMap } from "../../lib/onboarding/analyze";

const OPTS = { provider: "github" as const, owner: "org", repo: "repo", branch: "main" };

test("16. a Redis port alone is not a confirmed dependency", () => {
  const a = analyzeFileMap(
    { "docker-compose.yml": "services:\n  cache:\n    image: redis:7\n    ports:\n      - '6379:6379'\n" },
    OPTS,
  );
  assert.equal(a.dependencyFindings.redis.status, "unknown");
  assert.equal(a.dependencyFindings.redis.tier, "weak");
});

test("17. an explicitly disabled optional Helm dependency is not active", () => {
  const a = analyzeFileMap(
    {
      "charts/app/Chart.yaml": "apiVersion: v2\nname: app\ndependencies:\n- name: redis\n  condition: redis.enabled\n",
      "charts/app/values.yaml": "redis:\n  enabled: false\n",
      "go.mod": "module example\n\ngo 1.23\n\nrequire github.com/gomodule/redigo v1.9.3\n",
    },
    OPTS,
  );
  assert.equal(a.dependencyFindings.redis.status, "not_detected");
  assert.match(a.dependencyFindings.redis.summary, /explicitly disable/i);
});

test("18. an explicitly enabled and used Helm dependency is detected", () => {
  const a = analyzeFileMap(
    {
      "charts/app/Chart.yaml": "apiVersion: v2\nname: app\ndependencies:\n- name: redis\n  condition: redis.enabled\n",
      "charts/app/values.yaml": "redis:\n  enabled: true\n",
      "charts/app/templates/deployment.yaml": `kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        env:
        - name: REDIS_HOST
          value: app-redis
`,
    },
    OPTS,
  );
  assert.equal(a.dependencyFindings.redis.status, "detected");
  assert.ok(["strong", "medium"].includes(a.dependencyFindings.redis.tier));
});

test("19. a Compose service referenced by the application is detected", () => {
  const a = analyzeFileMap(
    {
      "compose.yaml": `services:
  api:
    build: .
    command: ./api
    depends_on:
    - db
    environment:
    - POSTGRES_HOST=db
  db:
    image: postgres:16
`,
    },
    OPTS,
  );
  assert.equal(a.dependencyFindings.postgres.status, "detected");
  assert.equal(a.dependencyFindings.postgres.tier, "strong");
});

test("20. an unrelated database port is not an application dependency", () => {
  const a = analyzeFileMap(
    {
      "compose.yaml": `services:
  metrics:
    image: postgres:16
    ports:
    - "3306:3306"
`,
    },
    OPTS,
  );
  assert.notEqual(a.dependencyFindings.mysql.status, "detected");
});

test("21. a driver package alone is weak evidence, never active", () => {
  const a = analyzeFileMap(
    { "package.json": JSON.stringify({ dependencies: { pg: "8.0.0" } }) },
    OPTS,
  );
  assert.equal(a.dependencyFindings.postgres.status, "unknown");
  assert.equal(a.dependencyFindings.postgres.tier, "weak");
});
