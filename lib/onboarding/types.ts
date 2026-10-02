/**
 * Onboarding wizard domain model (Screen_Navigation.md §7).
 *
 * One journey, ten steps: Basics → Repository → Analysis → Deployment →
 * Environment → Runtime → Dependencies → Health → Review → Complete.
 *
 * Data-integrity (RULE.md §9 / Design.md §43):
 * - `detected` = observed in the repository by analysis.
 * - `configured` = entered by the user.
 * - `not_detected` = analysis ran and found nothing.
 * - `unknown` = analysis ran, but the evidence is absent or too weak to decide.
 * - `unavailable` = analysis could not run (private repo, non-GitHub URL,
 *   offline). Never fabricate a finding — render these states explicitly.
 */

export type Provenance =
  | "detected"
  | "configured"
  | "not_detected"
  | "unknown"
  | "unavailable";

export type Environment = "Development" | "Staging" | "Production";

export const WIZARD_ENVIRONMENTS: readonly Environment[] = [
  "Development",
  "Staging",
  "Production",
];

export const WIZARD_STEPS = [
  "basics",
  "repository",
  "analysis",
  "deployment",
  "environment",
  "runtime",
  "dependencies",
  "health",
  "review",
  "complete",
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_META: Record<
  WizardStepId,
  { index: number; title: string; short: string }
> = {
  basics: { index: 0, title: "Project Basics", short: "Basics" },
  repository: { index: 1, title: "Repository Connection", short: "Repository" },
  analysis: { index: 2, title: "Repository Analysis", short: "Analysis" },
  deployment: { index: 3, title: "Deployment Configuration", short: "Deploy" },
  environment: { index: 4, title: "Environment & Secrets", short: "Env" },
  runtime: { index: 5, title: "Runtime Configuration", short: "Runtime" },
  dependencies: { index: 6, title: "Dependencies & Database", short: "Deps" },
  health: { index: 7, title: "Health Monitoring", short: "Health" },
  review: { index: 8, title: "Review & Connect", short: "Review" },
  complete: { index: 9, title: "Setup Complete", short: "Done" },
};

export type BasicsState = {
  name: string;
  description: string;
  tags: string[];
  environment: Environment | "";
};

export type RepositoryState = {
  url: string;
  branch: string;
  /** Honest connection state — there is no GitHub OAuth in this build. */
  provider: "github" | "other" | "";
  connection: "not_connected" | "url_only";
};

export type AnalysisStatus = "idle" | "analyzing" | "ready" | "unavailable";

/**
 * Why analysis could not complete. The wizard must never claim "no evidence"
 * when it simply failed to read the repository.
 *
 * - `no_url`          — the user continued without a repository.
 * - `unsupported_host`— not a public GitHub repository.
 * - `repo_unreachable`— network/auth/404 on the repository itself.
 * - `branch_not_found`— the repository exists, that ref does not.
 * - `rate_limited`    — GitHub refused the read (quota), not a missing file.
 * - `read_failed`     — the tree was read but file contents could not be fetched.
 */
export type AnalysisFailure =
  | "no_url"
  | "unsupported_host"
  | "repo_unreachable"
  | "branch_not_found"
  | "rate_limited"
  | "read_failed";

/** A repository tree entry as returned by the GitHub trees API. */
export type TreeEntry = {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
};

export type Detection<T> = {
  value: T | null;
  provenance: Provenance;
};

export type EvidenceConfidence = "high" | "medium" | "low";

/**
 * One traceable repository observation.
 *
 * `evidenceType` uses a domain-specific controlled vocabulary (for example
 * `service_target`, `container_command_argument`, or `helm_value`). It is a
 * string rather than one global union because ports, health checks,
 * dependencies, and commands each have different source semantics.
 */
export type Evidence = {
  sourcePath: string;
  field?: string;
  line?: number;
  evidenceType: string;
  semanticRole?: string;
  confidence: EvidenceConfidence;
  explanation: string;
};

export type PortProtocol = "TCP" | "UDP" | "SCTP" | "UNKNOWN";

export type PortRole =
  | "application_http"
  | "application_https"
  | "metrics"
  | "grpc"
  | "database"
  | "cache"
  | "message_queue"
  | "telemetry"
  | "service"
  | "ingress"
  | "node_port"
  | "unknown";

export type PortFinding = {
  port: number;
  protocol: PortProtocol;
  role: PortRole;
  evidence: Evidence;
};

/**
 * The analyzer may find several plausible application ports. `selected` is
 * populated only when one candidate is materially stronger than the rest.
 * Otherwise `ambiguous` is true, alternatives are exposed, and the wizard
 * must ask the user instead of silently choosing.
 */
export type ApplicationPortSelection = {
  selected: Detection<number>;
  alternatives: PortFinding[];
  ambiguous: boolean;
};

export type HealthEndpointRole =
  | "application"
  | "liveness"
  | "readiness"
  | "startup"
  | "metrics";

export type HealthEndpointFinding = {
  path: string;
  role: HealthEndpointRole;
  evidence: Evidence;
};

export type RuntimeCommandKind = "development" | "build" | "production";

export type RuntimeCommandSource =
  | "kubernetes_container"
  | "helm_default"
  | "compose_service"
  | "dockerfile"
  | "package_script"
  | "unknown";

export type DetectedCommand = {
  command: string | null;
  provenance: Provenance;
  strategy?: DeploymentStrategy | null;
  sourcePath?: string | null;
  field?: string | null;
  line?: number | null;
  sourceKind?: RuntimeCommandSource;
  confidence?: EvidenceConfidence;
  explanation?: string | null;
};

export type RuntimeCommandFindings = Record<RuntimeCommandKind, DetectedCommand>;

export type SupportedDependencyService = "postgres" | "mysql" | "mongodb" | "redis";

export type DependencyEvidenceTier = "strong" | "medium" | "weak" | "none";

export type DependencyFinding = {
  service: SupportedDependencyService;
  status: DependencyStatus;
  tier: DependencyEvidenceTier;
  evidence: Evidence[];
  summary: string;
};

export type RepoAnalysis = {
  status: "ready" | "unavailable";
  /** Human-readable reason when status is unavailable. Never a stack trace. */
  reason: string | null;
  /** Machine-readable cause when `status === "unavailable"`. */
  failure: AnalysisFailure | null;
  provider: "github" | "other";
  owner: string | null;
  repo: string | null;
  branch: string;
  reachable: boolean;
  /**
   * Traceable repository observations by finding. A finding with no entry here
   * is never shown as detected.
   */
  evidence: Record<string, Evidence[]>;
  /** The tree did not fit one API response, so coverage is partial. */
  truncated: boolean;
  framework: Detection<string>;
  language: Detection<string>;
  packageManager: Detection<string>;
  /**
   * `package.json` scripts exactly as written. Evidence for the runtime step:
   * `dev` / `build` / `start` are kept apart so a development server is never
   * mistaken for a production start command (RULE.md §9).
   */
  scripts: Detection<Record<string, string>>;
  dependencies: string[];
  dockerfile: Detection<boolean>;
  compose: Detection<boolean>;
  kubernetes: Detection<boolean>;
  kustomize: Detection<boolean>;
  helm: Detection<boolean>;
  ci: string[];
  envFiles: string[];
  /** Variable NAMES from .env.example — never values (RULE.md §11). */
  envVarNames: string[];
  entryPoints: string[];
  portFindings: PortFinding[];
  applicationPort: ApplicationPortSelection;
  runtimeCommands: RuntimeCommandFindings;
  productionCommands: DetectedCommand[];
  healthEndpoints: Detection<HealthEndpointFinding[]>;
  dependencyFindings: Record<SupportedDependencyService, DependencyFinding>;
  filesSeen: string[];
  analyzedAt: string;
};

export type DeploymentStrategy =
  | "dockerfile"
  | "compose"
  | "kubernetes"
  | "helm"
  | "framework"
  | "manual"
  | "none";

export type DeploymentState = {
  strategy: DeploymentStrategy | "";
  /** Accept a detected option, or pick another detected/manual option. */
  useDetected: boolean;
  notes: string;
};

export type EnvVar = { key: string; value: string };
export type SecretEntry = { key: string; hasValue: boolean };

export type EnvironmentState = {
  vars: EnvVar[];
  /** Names + presence only. Values live in memory during the wizard and
   *  are never written to localStorage, logs, or git (RULE.md §11). */
  secrets: SecretEntry[];
};

export type RuntimeState = {
  buildCommand: string;
  buildProvenance: Provenance;
  startCommand: string;
  startProvenance: Provenance;
  /** `npm run dev`-style command, deliberately separate from `startCommand`:
   *  monitoring must never be pointed at a development server. */
  devCommand: string;
  devCommandProvenance: Provenance;
  runtime: string;
  runtimeProvenance: Provenance;
  port: string;
  portProvenance: Provenance;
  protocol: "HTTP" | "HTTPS" | "TCP";
  rootDirectory: string;
};

export type DependencyStatus =
  | "detected"
  | "configured"
  | "not_detected"
  | "unknown";

export type DependenciesState = {
  postgres: DependencyStatus;
  mysql: DependencyStatus;
  mongodb: DependencyStatus;
  redis: DependencyStatus;
  externalApis: string[];
  queues: string[];
  notes: string;
};

export type HealthTargetType =
  | "unknown"
  | "external_url"
  | "kubernetes_service"
  | "ingress"
  | "load_balancer"
  | "node_port"
  | "custom";

export type HealthState = {
  method: "http" | "port" | "container";
  targetType: HealthTargetType;
  targetUrl: string;
  /** Route path checked on the target, such as `/` or `/healthz`. */
  endpoint: string;
  expectedStatus: string;
  intervalSec: string;
  timeoutSec: string;
  failureThreshold: string;
  methodProvenance: Provenance;
  targetProvenance: Provenance;
  endpointProvenance: Provenance;
};

export type WizardState = {
  basics: BasicsState;
  repository: RepositoryState;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  analysis: RepoAnalysis | null;
  deployment: DeploymentState;
  environment: EnvironmentState;
  runtime: RuntimeState;
  dependencies: DependenciesState;
  health: HealthState;
  /** Idempotency key — created once per wizard, reused on retry so Review →
   *  Start Monitoring can never create two projects (§no-duplicate). */
  draftId: string;
  currentStep: WizardStepId;
  /** Set once, after the server confirms creation. */
  createdProjectId: string | null;
  updatedAt: string;
};

export function emptyWizardState(draftId?: string): WizardState {
  return {
    basics: { name: "", description: "", tags: [], environment: "" },
    repository: { url: "", branch: "", provider: "", connection: "not_connected" },
    analysisStatus: "idle",
    analysisError: null,
    analysis: null,
    deployment: { strategy: "", useDetected: true, notes: "" },
    environment: { vars: [], secrets: [] },
    runtime: {
      buildCommand: "",
      buildProvenance: "not_detected",
      startCommand: "",
      startProvenance: "not_detected",
      devCommand: "",
      devCommandProvenance: "not_detected",
      runtime: "",
      runtimeProvenance: "not_detected",
      port: "",
      portProvenance: "not_detected",
      protocol: "HTTP",
      rootDirectory: "",
    },
    dependencies: {
      postgres: "unknown",
      mysql: "unknown",
      mongodb: "unknown",
      redis: "unknown",
      externalApis: [],
      queues: [],
      notes: "",
    },
    health: {
      method: "http",
      targetType: "unknown",
      targetUrl: "",
      // Intentionally empty: an endpoint is only ever filled from real
      // evidence (analysis) or by the user. Never pre-fill a guess and let it
      // read as if it were detected (RULE.md §9, Design.md §43).
      endpoint: "",
      expectedStatus: "200",
      intervalSec: "30",
      timeoutSec: "5",
      failureThreshold: "3",
      methodProvenance: "not_detected",
      targetProvenance: "not_detected",
      endpointProvenance: "not_detected",
    },
    draftId:
      draftId ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `draft-${Date.now()}`),
    currentStep: "basics",
    createdProjectId: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Shape the server accepts at Review → Start Monitoring. Secret VALUES are
 *  intentionally absent — only names + presence travel to the server. */
export type OnboardingSubmitPayload = {
  draftId: string;
  basics: BasicsState;
  repository: { url: string; branch: string; provider: string };
  analysis: RepoAnalysis | null;
  deployment: DeploymentState;
  envVars: EnvVar[];
  secrets: SecretEntry[];
  runtime: RuntimeState;
  dependencies: DependenciesState;
  health: HealthState;
};

export function toSubmitPayload(state: WizardState): OnboardingSubmitPayload {
  return {
    draftId: state.draftId,
    basics: state.basics,
    repository: {
      url: state.repository.url.trim(),
      branch: state.repository.branch.trim() || "main",
      provider: state.repository.provider || "other",
    },
    analysis: state.analysis,
    deployment: state.deployment,
    envVars: state.environment.vars,
    secrets: state.environment.secrets.map((s) => ({
      key: s.key,
      hasValue: s.hasValue,
    })),
    runtime: state.runtime,
    dependencies: state.dependencies,
    health: state.health,
  };
}
