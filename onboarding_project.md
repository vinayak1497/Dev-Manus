# Onboarding a Project — Wizard / Dialog

This file describes project onboarding exactly as implemented in code:
`components/onboarding/AddProjectWizard.tsx`, `components/onboarding/steps/*`,
`components/projects/AddProjectDialog.tsx`, `app/projects/new/page.tsx`,
`lib/onboarding/types.ts`, `lib/onboarding/validation.ts`,
`lib/onboarding/configuration.ts`, `lib/onboarding/deployment.ts`,
`lib/onboarding/presets.ts`, `lib/onboarding/health.ts`,
`lib/onboarding/dotenv.ts`, `lib/onboarding/storage.ts`,
`lib/onboarding/github.ts`, `app/api/onboarding/analyze/route.ts`,
`app/projects/actions.ts` (`createProjectFromOnboarding`).

No external specification is referenced below. Every behavior is traceable
to those files.

---

## 1. Two entries, one journey

There is exactly one wizard component: `AddProjectWizard`.

| Entry | File | How it mounts the wizard |
|---|---|---|
| Dialog | `components/projects/AddProjectDialog.tsx` | `Add project` button opens `Modal` containing `<AddProjectWizard onExit={close} onComplete={router.refresh()} />`. Footer adds `Open the wizard as a page` link to `/projects/new`. |
| Full page | `app/projects/new/page.tsx` | Header with `All projects` back link, then `<AddProjectWizard embedded exitHref="/projects" />`. Footer note: `Nothing is created until Review → Start Monitoring.` |

Behavior is identical in both. `embedded=true` only hides the modal close
button and uses `exitHref` for exit. `onComplete(projectId)` fires once,
after the server confirms exactly one project.

State shape (`lib/onboarding/types.ts`):

```ts
type WizardState = {
  basics: BasicsState;
  repository: RepositoryState;
  analysisStatus: "idle" | "analyzing" | "ready" | "unavailable";
  analysisError: string | null;
  analysis: RepoAnalysis | null;
  deployment: DeploymentState;
  environment: EnvironmentState;
  runtime: RuntimeState;
  dependencies: DependenciesState;
  health: HealthState;
  draftId: string;          // idempotency key, one UUID per wizard
  currentStep: WizardStepId; // basics → … → review → complete
  createdProjectId: string | null;
  updatedAt: string;
};
```

Step order (`WIZARD_STEPS`):

```
basics → repository → analysis → deployment → environment →
runtime → dependencies → health → review → complete
```

Navigation rules (`AddProjectWizard.tsx` → `goTo` / `next` / `back` / `submit`):

- Single state object, so `Back` never loses data.
- `Continue` validates the current step (`validateStep`). Errors block forward motion.
- Clicking `Review` in the stepper validates every step except `analysis` / `review` / `complete` and lands on the first failing step.
- `Back` / `Skip for now` (environment step only) never validates.
- `complete` is reachable only via `submit()`. Nothing is created during navigation.
- Footer buttons: `Back` + `Continue` on steps 1–8, `Back` + `Start Monitoring` on Review, no footer on Complete (`Open Dashboard` link instead).
- Step heading receives focus on change for keyboard / screen-reader users.

Draft survival (`lib/onboarding/storage.ts`):

- Every state change calls `saveDraft(state)` → `localStorage["dsg-onboarding-draft-v2"]`.
- Secret **values** are stripped before every write. Only `{ key, hasValue }` is stored.
- Secret values live in `sessionStorage["dsg-onboarding-secret-values-v1"]` via `saveSecretValues` / `loadSecretValues`. They survive refresh in the same tab but never touch `localStorage`, logs, or git.
- `loadDraft()` merges stored JSON onto `emptyWizardState()` — untrusted shapes are never trusted directly.
- `clearDraft()` + `sessionStorage.removeItem` run once after successful creation.

Field provenance (shown as badges in the UI):

- `detected` — filled from repository analysis.
- `configured` — typed or selected by the user (user edits always win).
- `not_detected` — analysis ran and found nothing.
- `unknown` — analysis ran but evidence is too weak to decide.
- `unavailable` — analysis could not run.
- `applyAnalysisSuggestions()` replaces only non-`configured` values on every analysis, so a repo change (e.g. Node → Go) cannot leave a stale `npm start` behind.

---

## 2. Step 1 — Project Basics (`StepBasics`)

Asked:

| Field | Control | Code rule |
|---|---|---|
| Project name | text input `ob-name`, `maxLength=80`, placeholder `e.g. Payments API` | Required. `validateBasics`: non-empty, ≤ 80 chars. |
| Description | textarea `ob-desc`, `maxLength=280` | Optional. ≤ 280 chars. |
| Tags | text input `ob-tags`, comma-separated | `parseTagsInput`: split on `,`, lowercase, strip `[^a-z0-9-_]`, drop empties, keep first 8. Validation: ≤ 8 tags, each ≤ 24 chars. Hint: `Lowercase letters, numbers, dashes. Used for search and grouping.` |
| Environment | 3-card radiogroup `Development / Staging / Production` (`WIZARD_ENVIRONMENTS`) + help modal | Required. `validateBasics` errors `Choose an environment.` when empty. |

How it is used:

- `name` → `projects.name` and slug source (`slugify`: lowercase, `[^a-z0-9]+` → `-`, trim dashes, slice 60; retry `slug`, `slug-2` … on `23505` collision). Shown in Projects list, dashboard header, Complete screen.
- `environment` → `projects.environment`. Shown on card, dashboard hero, Complete fact box. Scopes no monitoring logic by itself.
- `description`, `tags` → `project_configs.description` (null when empty), `project_configs.tags` (trimmed, non-empty only). Shown in Review → Project group and used for search/grouping display. Tags are edited later in Settings.

---

## 3. Step 2 — Repository Connection (`StepRepository`)

Asked:

| Field | Control | Code rule |
|---|---|---|
| Repository URL | text input `ob-repo`, `maxLength=200`, `inputMode=url`, placeholder `https://github.com/org/repo` | Optional. When non-empty: ≤ 200 chars and must parse (`parseRepoUrl`: `github.com/:owner/repo` → `github`; else must be a URL with a dotted hostname → `other`; else `That URL doesn't look valid.`). Empty is explicitly allowed. |
| Branch | text input `ob-branch`, `maxLength=100`, placeholder `main` | Optional. ≤ 100 chars. Empty means `main` at submit (`toSubmitPayload`: `branch.trim() \|\| "main"`). |

Derived state (no extra input):

- `provider`: `github` when URL matches `/github\.com/i`, `other` when any non-empty non-GitHub URL, `""` when empty.
- `connection`: `url_only` when URL non-empty, else `not_connected`. There is no OAuth connect button in this build — the section header reads `GitHub — Not connected` honestly.

Side effects in code:

- Typing a different URL resets `analysis=null`, `analysisStatus="idle"` (previous findings invalidated).
- Changing branch resets `analysis=null`, `analysisStatus="idle"`.
- Footer hint when empty: `No URL needed — Continue works.`

How it is used:

- `{ repositoryUrl, branch }` is the input to `POST /api/onboarding/analyze` in Step 3.
- At submit: `repository: { url, branch, provider }` is persisted. `projects.repository` stores the URL (or null). `project_configs.branch` and `repository_provider` store branch/provider.
- Empty URL → analysis step shows `No repository to analyse`, all later steps fall back to manual configuration. The project still completes.

---

## 4. Step 3 — Repository Analysis (`StepAnalysis`)

No form fields. One action: `Analyse repository` / auto-run / `Re-run analysis` / `Try again`.

Trigger logic (`AddProjectWizard.tsx` → `runAnalysis`):

1. No URL → `analysisStatus="unavailable"`, `analysis=null` immediately (no fetch).
2. Else `POST /api/onboarding/analyze` with `{ repositoryUrl, branch }`.
3. Auto-runs once when the analysis step is first shown with a URL (`analyzedFor` ref guards StrictMode double-effect).
4. Response `{ ok: true, analysis }` → `applyAnalysis(json.analysis)`. Any `{ ok: false }` or fetch throw → `analysisStatus="unavailable"` + `analysisError` message (`Analysis failed. Continue manually.` / `The analysis request failed. Continue with manual configuration.`).

API behavior (`app/api/onboarding/analyze/route.ts` + `lib/onboarding/github.ts`):

- One `GET api.github.com/repos/{owner}/{repo}` + one `GET git/trees/{branch}?recursive=1` (12s timeout), then up to N file blobs from `raw.githubusercontent.com` (8s timeout each, concurrency 8, `400KB`/file, `3MB` total, depth 5, 120 files via `discovery.ts` → `selectFiles`). Vendored/generated/binary paths skipped. `truncated=true` when the tree did not fit.
- Every failure is classified (`AnalysisFailure`): `no_url`, `unsupported_host` (non-GitHub), `repo_unreachable`, `branch_not_found`, `rate_limited` (429, or 403/401 with `x-ratelimit-remaining: 0` or `rate limit|abuse` body), `read_failed`. The UI renders the matching `FAILURE_MESSAGE`, never `no configuration found` for a quota error.

What the analyzer returns (`RepoAnalysis` in `types.ts`, built by `analyze.ts` + parsers `containers / kubernetes / helm / ports / routes / health-evidence / commands / dependencies / manifests / yaml`):

- Identity: `status`, `reason`, `failure`, `provider`, `owner`, `repo`, `branch`, `reachable`, `truncated`, `analyzedAt`, `filesSeen`.
- `framework`, `language`, `packageManager`: `Detection<string>` (`value` + `provenance`).
- `scripts`: `Detection<Record<string,string>>` — raw `package.json` scripts, kept as `dev` / `build` / `start` separately.
- `dependencies`: string[] package names (display only, never proof of a live dependency).
- `dockerfile`, `compose`, `kubernetes`, `kustomize`, `helm`: `Detection<boolean>`.
- `ci`: string[] workflow names. `envFiles`: string[] paths. `envVarNames`: string[] variable NAMES from `.env.example` only — values never read. `entryPoints`: string[] (e.g. `cmd/podcli/main.go`).
- `portFindings`: `PortFinding[]` (`port`, `protocol TCP/UDP/SCTP/UNKNOWN`, `role application_http/https/metrics/grpc/database/cache/message_queue/telemetry/service/ingress/node_port/unknown`, `evidence`).
- `applicationPort`: `{ selected: Detection<number>, alternatives, ambiguous }`. `selected` is set only when one candidate is materially stronger; ties set `ambiguous=true` and force the user to choose in Runtime.
- `runtimeCommands`: `{ development, build, production: DetectedCommand }` + `productionCommands: DetectedCommand[]` (per-strategy candidates with `strategy`, `sourcePath`, `field`, `line`, `sourceKind`, `confidence`, `explanation`).
- `healthEndpoints`: `Detection<HealthEndpointFinding[]>` (`path`, `role application/liveness/readiness/startup/metrics`, `evidence`).
- `dependencyFindings`: per `postgres/mysql/mongodb/redis` → `{ status, tier strong/medium/weak/none, evidence[], summary }`. Strong/medium → `detected`; weak → `unknown`; none/disabled → `not_detected`. A driver package or bare `DATABASE_URL` alone yields `unknown`, never `detected`.
- `evidence`: `Record<string, Evidence[]>` where each `Evidence = { sourcePath, field?, line?, evidenceType, semanticRole?, confidence high/medium/low, explanation }`. Every rendered finding shows its `sourcePath[:line] · confidence`.

How it is used (suggestions, not decisions):

- `suggestRuntimeFromAnalysis(analysis, strategy)` (`presets.ts`): fills `devCommand`, `buildCommand`, `startCommand` (prefers the candidate matching the selected deployment strategy), `runtime` (language only, no version guessing), `port` (only when `applicationPort.selected.value !== null`). All marked `detected`.
- `suggestDependenciesFromAnalysis`: copies the four tiered statuses into wizard state (only over non-`configured` values).
- `suggestHealthFromAnalysis`: when a functional endpoint exists → `{ method: "http", endpoint, detected }`; else when an unambiguous app port exists → `{ method: "port", detected }`; else `{}` (leave manual).
- Deployment strategy is **never** auto-selected. Analysis only refreshes `useDetected` (is the user's existing choice still among detected options?).
- Review → `Detected technology` group and Complete → `Detected` fact box render these values. `Import N names from .env.example` (Step 5) and port/health hints consume `envVarNames`, `applicationPort.alternatives`, `healthEndpoints`.

---

## 5. Step 4 — Deployment Configuration (`StepDeployment`)

Asked:

| Field | Control |
|---|---|
| Strategy | 7-card radiogroup: `Dockerfile / Docker Compose / Kubernetes manifests / Helm chart / Framework default / Manual / No deployment config yet`. Each card shows title, note, icon, and when detected a `detected` badge + up to 2 evidence paths. |
| Notes | text input `ob-depnotes`, `maxLength=200`, shown only for `manual / none / framework` (placeholder `e.g. Deploy via Render blueprint`). |

Options come from `deploymentOptionsFromAnalysis(analysis)` (`deployment.ts`): each strategy maps to analyzer booleans (`dockerfile/compose/kubernetes/helm/framework` value → `detected=true`) plus evidence paths. Headline logic:

- 1 detected → `We found {label} in your repository.`
- 2+ detected → `We found {A}, {B} in your repository — pick the one you actually deploy with.`
- None + no analysis → `We couldn't inspect a repository, so there's nothing to suggest. How is this deployed?`
- None + analysis ran → `We couldn't identify how this application is deployed. How is it deployed?`

Validation: `validateDeployment` requires a strategy (`Choose how to deploy, or pick "No deployment config yet".`).

Selection effect (`applyDeploymentStrategy` in `configuration.ts`): sets `strategy`, recomputes `useDetected` (is this choice in the detected set?), and refreshes only non-`configured` runtime fields (build/start/port) from strategy-specific evidence. A typed command is never overwritten by switching strategy.

How it is used:

- `deployment: { strategy, useDetected, notes }` is part of `canonicalSubmitSections` → stored in `project_configs.deployment`.
- `deploymentStrategyLabel(strategy)` is the single label source for Review, persistence, and dashboard read-back (no second mapping).
- Runtime validation branches on it: `kubernetes` / `helm` may leave production start empty (`deployment-managed`); every other strategy requires an explicit start command.
- Monitoring does not branch on strategy directly; the health target still determines what is checked.

---

## 6. Step 5 — Environment & Secrets (`StepEnvironment`)

Two groups. Footer offers `Skip for now` (only step with a skip action).

### 6a. Environment variables (non-sensitive)

- Rows of `{ key, value }` inputs. Keys uppercased on change. `Add variable` appends `{ key: "", value: "" }`. Trash removes the row.
- `Import .env` (`EnvVarImport.tsx` + `dotenv.ts`): hidden file input (`accept=".env,.env.*,text/plain"`, 256KB limit) → `file.text()` → `parseEnvSource` (handles `KEY=value`, single/double quotes with unescape, `=` inside values, empty values, `#` comments, blank lines, `export` prefix, BOM) → `mergeEnvVars(existing, parsed)`:
  - New keys → `added` → appended as ordinary rows.
  - Keys already present → `conflicts` → current value kept, UI offers `Keep existing` / `Use imported` per key (`applyImportedValue` only on explicit choice).
  - Bad lines → `issues` (`invalid-name / missing-equals / unterminated-quote / duplicate-in-file` with line number + key only, never values) behind a `Show/Hide` toggle.
  - Summary line: `N variables imported · M conflicts · K skipped`. File is read with the browser File API and parsed in memory — never uploaded, never logged.
- `Import N names from .env.example` button (visible when analysis found `envVarNames` and no vars exist yet): creates up to 12 `{ key: NAME, value: "" }` rows.

Validation (`validateEnvironment`): skip empty-empty rows; keys must match `/^[A-Za-z_][A-Za-z0-9_]*$/`; no duplicate keys (case-sensitive after trim).

How vars are used: stored in `project_env_vars` as `{ key, value, is_secret: false, has_value: value non-empty }`. Also visible in Review (`Variables: N defined` + first 5 rows). Plain values are readable by the dashboard config card (`lib/project-config.ts` selects `key, is_secret, has_value` — values of non-secrets flow through the stored JSON path, secret values never do).

### 6b. Secrets (credentials)

- Rows of `{ key, hasValue }` + session-only value box (`type=password` with `Show/Hide values` toggle, `Eye/EyeOff`). `Add secret` appends `{ key: "", hasValue: false }`. Typing a value calls `setSecretValue(key, value)` → updates `sessionStorage` and flips `hasValue = value.length > 0` so Review can honestly show `(value set)` vs `(name only)`.
- Placeholder: `session only — not saved`. Hint: `Only names + "value provided?" are saved. Values never leave this tab.`

Validation: names non-empty, match `isValidEnvVarKey`, no duplicates.

How secrets are used: `toSubmitPayload` maps secrets to `{ key, hasValue }` — **values are absent from the payload by construction**. Server stores `{ key, value: null, is_secret: true, has_value }`. The dashboard env-var query never selects `value` for secrets, so a secret cannot reach a server component even if a row were malformed.

---

## 7. Step 6 — Runtime Configuration (`StepRuntime`)

Asked (all text inputs except protocol select):

| Field | Placeholder / options | Provenance shown |
|---|---|---|
| Development command | `How developers run it locally` (optional) | `devCommandProvenance` |
| Build command | `How its artifact is built` (optional) | `buildProvenance` |
| Production start | `How the deployed workload starts the app`, or `Deployment-managed — leave empty when the workload starts itself` for k8s/helm. Required unless `deployment.strategy` is `kubernetes`/`helm`. | `startProvenance` |
| Runtime | `Detected language or runtime` (optional) | `runtimeProvenance` |
| Port | `Application port`, digits only (`replace(/[^0-9]/g,"")`) | `portProvenance` + ambiguity hint when `applicationPort.alternatives` exist and port is empty |
| Protocol | select `HTTP / HTTPS / TCP` | none (defaults `HTTP`) |
| Root directory | `./ (or packages/api)`, monorepos (optional) | none |

Any manual edit sets that field's provenance to `configured`, protecting it from future analysis overwrites.

Validation (`validateRuntime` + mirrored server `validateOnboardingPayload`):

- `startCommand` empty → error `Enter a start command.` unless strategy is `kubernetes`/`helm` (then `deployment_managed` is legal).
- Non-Node language + `npm|yarn|pnpm|bun` in start → error naming the actual language (`That {language} command uses a JavaScript package manager…`).
- `npm run dev|yarn dev|pnpm dev|go run` in start for k8s/helm → `Use the deployed workload's production start command, not a development command.`
- `port` non-empty → integer `1–65535` (`Port must be 1–65535.`).

How it is used:

- `runtime: { buildCommand, startCommand, devCommand, runtime, port, protocol, rootDirectory + provenances }` is stored in `project_configs.runtime` via `canonicalSubmitSections`.
- `resolveProductionStart`: `command` (start non-empty) / `deployment_managed` (empty + k8s/helm) / `not_set`. Review renders `Production start` accordingly; `not_set` blocks submit for non-k8s/helm.
- `dev` / `build` / `production` are kept apart so monitoring is never pointed at a dev server. The health checker and worker read the health section, not these commands; these commands document how to run the workload and feed the dashboard config card.

---

## 8. Step 7 — Dependencies & Database (`StepDependencies`)

Asked:

| Field | Control |
|---|---|
| PostgreSQL / MySQL / MongoDB / Redis | 4 tap-to-cycle buttons. Each tap advances `unknown → detected → configured → not_detected → unknown` (`STATUS_CYCLE`). Badge shows current status; subtitle shows analyzer `summary` when analysis is ready, else `Tap to change`. `aria-label="{label}: {status}. Activate to change."` |
| External APIs | `ApiList`: `Add entry` → rows with placeholder `api.stripe.com`, per-row remove, `Add another`. Optional. |
| Queues & caches | Same `ApiList` with placeholder `NATS subject, SQS queue…`. Optional. |
| Notes | text input `ob-depnotes2`, `maxLength=200`. Optional. |

Validation: `validateDependencies` always returns `{}` — `unknown` is an honest, submittable answer.

How it is used:

- Initial values come from `suggestDependenciesFromAnalysis` (tiered: strong/medium → `detected`, weak → `unknown`, none/disabled → `not_detected`), but only over non-`configured` slots. User taps are preserved.
- `dependencies: { postgres, mysql, mongodb, redis, externalApis, queues, notes }` is stored in `project_configs.dependencies` and rendered verbatim in Review → Dependencies and the dashboard config card. No health-check or detection logic branches on these values today; they document what the app depends on for investigation context.

---

## 9. Step 8 — Health Monitoring (`StepHealth`)

Asked:

| Field | Control | Code rule |
|---|---|---|
| Check method | 3-card radiogroup: `HTTP endpoint` (`Verifies the app answers with the expected status.`) / `Port check` (`Verifies something listens on the port.`) / `Container check` (`Verifies the container/process stays running.`). Selecting sets `methodProvenance="configured"`. | Always set (defaults `http`). |
| Monitoring target type (http only) | select `Unknown / External URL / Kubernetes Service / Ingress / Load balancer / NodePort / Custom` (`HEALTH_TARGET_TYPE_LABEL`) | Informational label; auto-flips `unknown → external_url` on first target typing. Stored. |
| Target URL (http only) | input `ob-htu`, placeholder `https://app.example.com` | `normalizeHealthTarget`: absolute URL, `http://`/`https://` only, hostname required, no credentials, hash stripped, ≤ 200 chars. Required for http (`Enter the monitoring target URL.`). Typing a full URL into the endpoint field errors with `Put a full URL in Target URL and keep only the route path here.` |
| Endpoint path (http only) | input `ob-hep`, placeholder `/` | `normalizeHealthPath`: must start with `/`, no scheme, no `space < > "`, collapses `//`, preserves `?query`, ≤ 200 chars. Required for http (`Enter a health endpoint path, or switch method.`). Legacy full-URL drafts are split via `splitHealthEndpoint`. |
| Expected status (http only) | select `HTTP 200 / 201 / 202 / 204 / 301 / 302` | Must be in `HEALTH_EXPECTED_STATUS_VALUES`. |
| Interval (s) | input `ob-hint`, digits only | Integer `10–3600` (`HEALTH_INTERVAL_MIN/MAX_SEC`). Default `30`. |
| Timeout (s) | input `ob-hto`, digits only | Integer `1–120`. Default `5`. |
| Failures to alert | input `ob-hft`, digits only | Integer `1–10`. Default `3`. |

Live preview: `Resulting check URL: {check.url}` from `buildHealthCheckUrl(targetUrl, endpoint)` (joins base path + endpoint path without double slashes), or `Enter a target URL and endpoint path to preview the exact checked URL.` when incomplete. `port` / `container` methods show an honesty box instead (`Port checks confirm reachability only…` / `Container checks confirm the process stays up…`).

Validation (`validateHealth`, mirrored server-side): method=http requires valid target + endpoint; interval/timeout/threshold bounds; expected status allowlist.

How it is used:

- `resolveHealthCheck(health)` produces the canonical `{ method, targetType, targetUrl, endpointPath, expectedStatus, intervalSec, timeoutSec, failureThreshold, checkUrl + provenances }`. `normalizeHealthState` additionally splits a legacy full-URL endpoint into target+path before resolving.
- Stored in `project_configs.health`. This is the **only** wizard section the monitor executes:
  - `Run HTTP check` (`health-actions.ts` → `runConfiguredHttpCheckCore`) runs only when `method=http` + runnable target+endpoint; otherwise the dashboard hides the button.
  - The background worker (`lib/monitoring/scheduler.ts`) discovers `project_configs where monitoring_enabled=true`, checks `hasRunnableHttpConfig()`, and schedules `GET` probes at `intervalSec` with `timeoutSec`, counting `failureThreshold` consecutive external failures before detection treats the streak as genuine.
  - `port` / `container` methods are stored and displayed but have no executor — the UI says so rather than pretending.
- Review renders `Method`, `Target type`, `Target URL`, `Endpoint path`, `Checked URL`, and `Schedule: every {interval}s · timeout {timeout}s · alert after {threshold} failures`.

---

## 10. Step 9 — Review & Connect (`StepReview`)

No inputs. Renders `buildCanonicalConfiguration(state)` grouped with per-group `Edit` jumps (`onEdit(step)`):

- Project: name / description / tags / environment.
- Repository: URL (`Not connected` when empty) / branch (`main` default) / provider (`GitHub (public URL)` / `Other host (manual)` / `—`).
- Detected technology: framework / language / package manager / Dockerfile / Compose / Kubernetes — or `Analysis unavailable — manual configuration applies. {reason}`.
- Deployment: strategy label + notes.
- Runtime: build / production start (`Deployment-managed (not stored)` vs command vs `—`) / development (`Not set` vs command) / runtime / port + protocol / root. Each shows its provenance badge when set.
- Environment: `Variables: N defined` + first 5 rows, `Secrets: KEY (value set|name only)`, plus `Secret values are never stored — only names travel to the server.`
- Dependencies: postgres / mysql / mongodb / redis statuses + external APIs when present.
- Health monitoring: method line (`HTTP {path} → {status}` / `Port availability` / `Container availability`), target type / target URL / endpoint path / checked URL (http only), schedule line.

Footer note: `Creates one project and saves this configuration. You can edit everything later in Settings.` Server errors render as `role=alert`.

Primary action `Start Monitoring` → `submit()`:

1. Re-validates every step except `analysis/review/complete`; jumps to the first failing step.
2. Builds `payload = { ...toSubmitPayload(state), ...canonicalSubmitSections(state) }`. `toSubmitPayload` trims URL/branch (default `main`), maps secrets to names-only, and carries `draftId` + raw analysis. `canonicalSubmitSections` replaces deployment/runtime/dependencies/health with the canonical builders so Review, validation, persistence, and read-back agree.
3. Calls server action `createProjectFromOnboarding(payload)` (`app/projects/actions.ts`):
   - Auth check (`supabase.auth.getUser`), boundary validation (name ≤ 80, description ≤ 280, ≤ 8 tags each ≤ 24, valid environment, repo URL ≤ 200, branch ≤ 100, strategy in 7 allowlist, env/secret key regex + duplicates, `validateOnboardingPayload` for runtime/health bounds), `draftId` non-empty.
   - `ensurePersonalOrg`: reuse caller's oldest owned org or create `My Workspace` + `owner` membership.
   - Idempotency: `project_drafts[draft_id] → created_project_id`; when the project still exists, return it without creating a second row.
   - `projects` insert (`organization_id, name, slug±retry, created_by, environment, repository|null, is_demo:false`). No telemetry columns are set — health stays null → `Unknown`.
   - `project_configs` upsert (`description, tags, branch, repository_provider, analysis, deployment, runtime, dependencies, health`; `monitoring_status` deliberately **not** set → DB default `pending` until a real check reports).
   - `project_env_vars` upsert (vars with values, secrets as `{ key, value: null, is_secret: true, has_value }`).
   - `project_drafts` upsert (`complete/created`).
   - `revalidatePath("/projects")`.
4. On `{ ok: true, projectId }`: `clearDraft()`, remove session secret values, set `createdProjectId` + `currentStep="complete"`, `onComplete(projectId)`, `router.refresh()`.
5. On `{ ok: false, error }`: `submitError` renders inline; nothing navigates. Button shows `Creating project…` / `Saving configuration…` while pending.

---

## 11. Step 10 — Setup Complete (`StepComplete`)

No inputs. Reads the same canonical configuration plus `projectId`.

Three separate facts (never conflated):

1. `Configuration saved` — `Your answers are stored and the project exists.`
2. `Monitoring configured` — `DevOps Safeguard knows how to check {checkUrl | port N | container}.`
3. `First check pending` — `No check has run yet, so health is Unknown — not Healthy and not failing.`

Fact boxes: repository (or `Not connected`), environment, detected (`{framework · language · Docker}` or `Nothing detected` / `Analysis unavailable`), monitoring (`Configured — {target}`).

Primary action: `Open Dashboard` → `/projects/{projectId}`. Caption: `Step 10 of 10 · {projectId[0:8]}`. Recommendation box points at the dashboard to verify runtime/health settings before connecting a monitoring source.

---

## 12. How answers flow after creation

| Wizard answer | Stored in | Read back by |
|---|---|---|
| name / environment / repository URL | `projects.{name, slug, environment, repository}` | Projects list cards/table, dashboard hero |
| description / tags / branch / provider / analysis / deployment / runtime / dependencies / health | `project_configs.{description, tags, branch, repository_provider, analysis, deployment, runtime, dependencies, health}` (JSONB) | Dashboard `Monitoring configuration` card via `readProjectConfig` (`lib/project-config-read.ts`, narrowed by `stored-config.ts`) |
| var names + values, secret names + presence | `project_env_vars.{key, value, is_secret, has_value}` (`value=null` for secrets) | Config card counts + secret names (values never selected for secrets) |
| health target + path + schedule | `project_configs.health` | `Run HTTP check` button visibility, worker `discoverCandidates` / `resolveDueServices` / `claimDueCheck` → `runConfiguredHttpCheckCore` |
| `draftId` → `projectId` | `project_drafts.{draft_id, created_project_id, status}` | Retry/refresh idempotency in `createProjectFromOnboarding` |

`monitoring_status` starts at the column default `pending`. Only a real observation (`service_health_checks` with `source=external`) flips it toward `active` — configuring a check is never reported as a healthy system.
