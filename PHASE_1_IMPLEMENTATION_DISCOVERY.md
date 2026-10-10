# Phase 1 Implementation Discovery — DevOps Safeguard

**Mode:** Investigation only. No code was modified, no migrations created, no packages installed, no configuration changed.
**Source of truth:** Actual code inspected in this repository (file:line references). Documentation was used only for terminology.
**Date:** 2026-10-03
**Headline finding:** The intended Phase 1 flow **already exists as implemented code**. `app/projects/[id]/health-actions.ts::runConfiguredHttpCheck` performs a real server-side HTTP GET against the onboarded target, classifies it via `lib/monitoring/http-check.ts`, persists a `source='external'` observation to `service_health_checks`, and feeds the existing `runMonitorTick` → `reconcileService` → incident → dashboard pipeline. It is wired to the dashboard via `components/projects/OperationalControls.tsx` ("Run HTTP check" button). A future "implementation" prompt should therefore be framed as **verify / harden / close small gaps**, not greenfield construction.

---

## SECTION 1 — Current Architecture

### Q1. What is the current actual architecture?

```
Browser (React Server Components + Client islands)
  app/projects/[id]/page.tsx            — Project Dashboard (RSC, force-dynamic)
  components/projects/OperationalControls.tsx   — "Run monitor check" + "Run HTTP check" + demo controls (client)
  components/projects/MonitoringConfiguration.tsx — read-back of stored onboarding config (RSC)
  components/onboarding/steps/*.tsx     — 10-step wizard UI (client)
        ↓ server actions ("use server") / API routes
  app/projects/actions.ts               — createProject, createProjectFromOnboarding (Review → Start Monitoring)
  app/projects/[id]/incidents/actions.ts — setupDemoScenario, simulateControlledFailure,
                                           runProjectMonitor, generateAnalysis,
                                           approve/reject/executeRemediation, authed/canSeeProject
  app/projects/[id]/health-actions.ts  — runConfiguredHttpCheck (REAL probe + tick)
  app/api/dev/seed/route.ts            — dev-only sample-data seeding (POST/DELETE, 404 in production)
  app/api/onboarding/analyze/route.ts  — repository analysis endpoint
  app/auth/callback/route.ts           — Supabase auth callback
        ↓ pure library cores (deterministic, unit-tested)
  lib/onboarding/*                     — types, validation, health (URL model), configuration,
                                         presets, analyze/discovery, github, manifests, helm,
                                         kubernetes, containers, deployment, dotenv, evidence, ports, commands
  lib/onboarding/stored-config.ts      — normalizeStoredConfig (narrow untrusted JSONB)
  lib/project-config.ts                — loadProjectConfig (RLS-scoped read-back)
  lib/monitoring/http-check.ts         — classifyHttpStatus, classifyNoResponse,
                                         isBlockedHostname, isBlockedAddress (PURE)
  lib/detection/reconcile.ts           — reconcileService (PURE), severityForStatus,
                                         isUnhealthyStatus/isHealthyStatus, DEFAULT_VERIFICATION_CHECKS=3
  lib/detection/monitor.ts             — runMonitorTick (IO shell: read → reconcile → write → rollup)
  lib/remediation/*                    — engine (allowlisted demo-only execution) + actions (specs)
  lib/ai/*                             — analyze-incident (read-only), providers (anthropic/deterministic), schema
  lib/incidents.ts                     — ServiceStatus, IncidentSeverity/Status, narrowers (toService,
                                         toIncident, toServiceHealthCheck, …), lifecycle display mapping
  lib/incidents/load.ts                — loadIncidentBundle (single loader for detail/report/export)
  lib/projects.ts                      — ProjectHealth, ProjectSummary, sort/filter/count/format helpers
  lib/supabase/{client,server,middleware} — anon-key RLS-scoped clients; USER_ID_HEADER
        ↓ Supabase Postgres (RLS everywhere, SECURITY DEFINER helpers)
  migrations:
    20260928000000_phase1_core.sql              — profiles, organizations, organization_members, projects
    20260929000000_profile_trigger.sql           — profile trigger
    20260930000000_project_telemetry_and_rls_fix.sql — is_org_member/has_org_admin_role helpers,
                                                     recursive-policy fix, projects telemetry columns
                                                     (health, service_count, active_incident_count,
                                                      last_checked_at, deployment_*, is_demo, …)
    20261001000000_incident_domain.sql          — services, incidents, incident_events, incident_evidence,
                                                 ai_analyses, remediation_actions (+can_access_project/incident)
    20261002000000_detection_and_verification.sql — service_health_checks, verification_runs,
                                                 remediation_actions.action_type allowlist
    20261003000000_project_onboarding.sql       — project_drafts, project_configs (health JSONB, …),
                                                 project_env_vars (names + presence only)
        ↓ downstream consumers
  Detection: runMonitorTick reads latest service_health_checks → reconcileService decides →
             writes incidents / incident_events / incident_evidence / verification_runs /
             services.status → rolls up projects.health, service_count,
             active_incident_count, last_checked_at
  Dashboard: app/projects/[id]/page.tsx re-reads projects + services + incidents +
             loadProjectConfig and renders; revalidatePath refreshes after actions
```

Communication is **Next.js server actions / route handlers → Supabase via anon key → RLS**. There is no separate backend process, no queue, no cron, no background worker, no WebSocket/SSE (verified by grep for `cron|scheduler|queue|background|worker` — only false positives in CSS copy, demo copy, and supabase `config.toml` `per_worker` request policy). Authorization is enforced in the database (RLS + `can_access_project` / `can_access_incident` + `is_org_member`), never by URL secrecy.

Exact files per layer:

| Layer | Files |
|---|---|
| Frontend (RSC pages) | `app/projects/[id]/page.tsx`, `app/projects/page.tsx`, `app/projects/[id]/incidents/[incidentId]/page.tsx`, `app/projects/new/page.tsx` |
| Frontend (client islands) | `components/projects/OperationalControls.tsx`, `components/onboarding/steps/StepDepsHealth.tsx`, `components/onboarding/steps/StepReviewComplete.tsx`, `components/projects/MonitoringConfiguration.tsx` |
| Server actions | `app/projects/actions.ts`, `app/projects/[id]/incidents/actions.ts`, `app/projects/[id]/health-actions.ts` |
| API routes | `app/api/dev/seed/route.ts`, `app/api/onboarding/analyze/route.ts`, `app/auth/callback/route.ts` |
| lib/ pure cores | `lib/onboarding/*`, `lib/monitoring/http-check.ts`, `lib/detection/reconcile.ts`, `lib/incidents.ts`, `lib/projects.ts` |
| lib/ IO shells | `lib/detection/monitor.ts`, `lib/project-config.ts`, `lib/incidents/load.ts`, `lib/remediation/engine.ts`, `lib/ai/analyze-incident.ts` |
| Database | `supabase/migrations/*.sql` (6 files listed above), `lib/supabase/database.types.ts` (generated) |
| Monitoring/detection | `lib/detection/monitor.ts` + `lib/detection/reconcile.ts`, triggered from the 5 call sites in Q2 |
| Tests | `tests/unit/*.test.ts` (17 files, `node:test`), `supabase/tests/*.sql` (RLS, via `supabase/tests/run.ps1` / `run.sh`) |

### Q2. What is the current monitoring entry point?

`runMonitorTick(supabase, projectId, userId)` — `lib/detection/monitor.ts:349`. One monitor pass over a project: load services → `latestCheck` per service → optional self-copy probe insert → `reconcileService` → `applyDecision` → persist `services.status` → roll up `projects` row. Returns `{ ok, error?, createdIncidents, resolvedIncidents }`.

Every caller (verified by grep):

| # | File:function | Who calls it | Kind | Data passed | Return handling |
|---|---|---|---|---|---|
| 1 | `app/projects/[id]/health-actions.ts:185` inside `runConfiguredHttpCheck` | "Run HTTP check" button (`OperationalControls.tsx:81`) | **Manual REAL** — performs a live HTTP GET first, persists `source='external'` observation, then ticks | `(supabase, projectId, userId)` — RLS-scoped client from `authed()` | `tick.ok` checked; on failure returns "Detection pass failed"; on success resolves `activeIncidentOnService` and revalidates dashboard + incident pages |
| 2 | `app/projects/[id]/incidents/actions.ts:333` inside `runProjectMonitor` | "Run monitor check" button (`OperationalControls.tsx:71`) | **Manual REAL-detection** — no new observation; reconciles whatever the latest stored checks say | `(supabase, projectId, userId)` | Opens/resolves counted into user message; `revalidateIncident(projectId)` |
| 3 | `app/projects/[id]/incidents/actions.ts:212` inside `setupDemoScenario` | "Set up demo services" button (dev-only) | **Demo setup** — creates 3 `is_demo` services + `source='synthetic'` baselines, then ticks | same | Message only |
| 4 | `app/projects/[id]/incidents/actions.ts:282` inside `simulateControlledFailure` | "Simulate controlled failure" button (dev-only) | **Simulation** — writes `source='simulation'` critical check on demo `api` + deployment marker, then ticks | same | Navigates to incident when created |
| 5 | `app/projects/[id]/incidents/actions.ts:469` inside `executeRemediation` | Approve → Execute flow | **Remediation-related** — after allowlisted demo fix, kicks a tick so verification advances | same | Outcome message notes "not marked resolved until verification passes" |

**Phase 1 entry point (no change needed): `runConfiguredHttpCheck` in `app/projects/[id]/health-actions.ts:62`.** It is the only caller that injects a real network observation before ticking, and the only path that reads the onboarded health configuration. `runProjectMonitor` is the correct companion for "manual tick without new probe" acceptance steps. Do NOT repoint or wrap these; reuse them.

---

## SECTION 2 — Project → Service Architecture

### Q3. What exactly does `services` represent?

Evidence:

- Schema (`20261001000000_incident_domain.sql:44-58`): `services(id, project_id, name, kind, status, description, is_demo, created_at)`, `UNIQUE (project_id, name)`. No URL/endpoint/target columns. `kind` is free text (`frontend`, `backend`, `database`, `http-endpoint` observed in code).
- Writes: demo setup creates **three** services per project (`web`, `api`, `database` — `incidents/actions.ts:108-136`); the real probe path creates **exactly one** service per project named `"Application endpoint"` with `kind='http-endpoint'` and `description='Configured HTTP check: <url>'` (`health-actions.ts:42-43,105-138`), idempotent on `(project_id, name)`.
- Reads: monitor ticks **every** service in the project (`monitor.ts:356-359`); dashboard lists up to 5 + counts (`page.tsx:275-317`); incident detail joins the single `service_id`.
- Types: `lib/incidents.ts:84-92` `Service{id,name,kind,status,description,isDemo}` — no endpoint concept.

Answer: **In the current code a `service` is a hybrid: (a) a coarse component of a project (demo: web/api/database), and (b) the single executable target of the configured HTTP check ("Application endpoint").** It is NOT one-deployable-application (that is `projects`), and NOT strictly one-health-endpoint either (the demo services have no endpoint at all; the real service collapses the whole project config to one row). The code does not enforce "one service per project" — the project model supports multiple services — but the real probe path implements a **one-canonical-service-per-project** convention. Multi-service real monitoring (e.g. one service per detected port/dependency) does not exist.

### Q4. What fields currently exist on `services`?

Source: `20261001000000_incident_domain.sql:44-58` + `lib/supabase/database.types.ts:646-686` + writers/readers cited.

| Field | Type | Purpose | Currently written? | Currently read? | Relevant to Phase 1? |
|---|---|---|---|---|---|
| `id` | uuid PK, default `gen_random_uuid()` | Row identity; FK target of `service_health_checks.service_id`, `incidents.service_id` | Yes (default; explicit on insert) | Yes — everywhere (monitor, dashboard, incident bundle) | Yes — join key |
| `project_id` | uuid FK → `projects.id`, cascade delete | Tenant scope + RLS (`can_access_project`) | Yes — all inserts set it | Yes — `eq("project_id", …)` in monitor + dashboard | Yes |
| `name` | text, unique per project | Human key; `"Application endpoint"` is the canonical real-probe service; `web/api/database` are demo | Yes — probe upsert + demo setup | Yes — monitor display, reconcile title, dashboard list | Yes — idempotency key `(project_id, name)` |
| `kind` | text, nullable | Free-text category (`http-endpoint`, `frontend`, `backend`, `database`) | Yes | Yes — displayed via `toService` | Marginal — distinguishes real (`http-endpoint`) from demo |
| `status` | text nullable, CHECK in `healthy,warning,critical,unknown,maintenance,recovering` | Post-reconcile state; `null` = never observed → renders Unknown | Yes — monitor updates when `result.serviceStatus !== service.status` (`monitor.ts:460-465`); probe insert sets `null` on create, demo sets `healthy` | Yes — `latestCheck` fallback (`monitor.ts:387`), rollup, dashboard badges | Yes — the health state Phase 1 drives |
| `description` | text, nullable | For the real service: the exact URL checked (`Configured HTTP check: <url>`, kept in sync on every run); for demo: static prose | Yes — probe path writes/updates it | Yes — `toService`, dashboard (via service row) | Yes — audit trail of what was actually probed |
| `is_demo` | boolean, default false | Marks sample rows so UI labels them (RULE.md §9.1) | Yes — `false` on real path, `true` on demo/simulation | Yes — demo badges, `isDemo` propagation to child rows | Yes — must stay `false` on the real path |
| `created_at` | timestamptz, default `now()` | Audit | Default only | Rarely displayed | No |

No URL, port, expected-status, timeout, interval, or threshold columns exist on `services`. All of that lives in `project_configs.health` (JSONB).

### Q5. How should one newly onboarded project map to services?

Actual flow today (`app/projects/actions.ts:198-421`):

```
wizard state → toSubmitPayload → createProjectFromOnboarding
  → projects row (ONE, idempotent on draftId via project_drafts)
  → project_configs row (upsert on project_id; health/deployment/runtime/dependencies JSONB)
  → project_env_vars rows (names + presence only)
  → project_drafts row (status created)
  → NO service row is created. NO health check runs. health stays null → Unknown.
```

Then, on first "Run HTTP check" (`health-actions.ts:105-138`):

```
loadProjectConfig → buildHealthCheckUrl → find-or-create
services row (project_id, name="Application endpoint") → real fetch →
service_health_checks (source='external') → runMonitorTick → …
```

Determinations:

- **Whether a service is created at onboarding:** No. Verified: no `services` insert in `app/projects/actions.ts`; creation is lazy on first probe run.
- **Where it should logically be created:** It already is — lazily and idempotently in `runConfiguredHttpCheck`. Creating it eagerly at onboarding would be a behavior change (and would create `status=null` rows with no observation); not required for Phase 1.
- **One service or multiple:** Today exactly **one canonical real service** per project (`UNIQUE (project_id, name)` + fixed `SERVICE_NAME`). Multiple services are supported by the schema and used by demo (3 services), but the real path uses one.
- **Does GitHub analysis provide enough to identify the service:** Partially. Analysis suggests an endpoint **path** (`suggestHealthFromAnalysis` → `suggestedFunctionalEndpoint`, `presets.ts:93-105`) and port evidence, but the **target URL is always user-entered** (or empty → validation error). Analysis never supplies a hostname. So: path yes (sometimes), target no.
- **Does the project model support multiple services:** Yes (schema + monitor loop over all services + dashboard list). The one-service convention is a product choice in `health-actions.ts`, not a schema limit.

Multiple interpretations still open (listed, not chosen): (i) keep one canonical service per project (current); (ii) create one service per detected component/port in future; (iii) create the service eagerly at onboarding. Only (i) matches existing code.

---

## SECTION 3 — Health Configuration

### Q6. What exactly is stored in the current health configuration?

Full mapping (verified against `lib/onboarding/types.ts:330-343`, `validation.ts:153-175,205-240`, `stored-config.ts:34-43,125-140`, `project-config.ts:44-83`, `health.ts`, dashboard readers):

```
User input (StepDepsHealth.tsx + StepReviewComplete.tsx)
  method: "http" | "port" | "container"      (default "http")
  targetType: HealthTargetType                (default "unknown"; informational only)
  targetUrl: string                           (e.g. https://app.example.com)
  endpoint: string                            (e.g. /healthz)
  expectedStatus: string                      (default "200")
  intervalSec: string                         (default "30")
  timeoutSec: string                          (default "5")
  failureThreshold: string                    (default "3")
  + 3 provenance fields (method/target/endpointProvenance)
        ↓ types (HealthState, types.ts:330-343)
        ↓ validation (validateHealth client + validateOnboardingPayload server-boundary;
           http method requires valid targetUrl + endpoint; interval 10–3600 int;
           timeout 1–120 int; threshold 1–10 int; expectedStatus allowlist
           200/201/202/204/301/302)
        ↓ database (project_configs.health JSONB — same 8 fields verbatim;
           see actions.ts:351; monitoring_status deliberately NOT set, stays 'pending')
        ↓ read function (loadProjectConfig → normalizeStoredHealth → StoredHealth
           {method,targetType,targetUrl,endpoint,expectedStatus,intervalSec,timeoutSec,failureThreshold})
        ↓ current consumers
           • runConfiguredHttpCheck (health-actions.ts:73-91): method, targetUrl, endpoint,
             expectedStatus, timeoutSec.  ← the ONLY runtime consumer.
           • MonitoringConfiguration (dashboard): ALL fields displayed (incl. interval,
             failureThreshold, targetType) + derived checkUrl via buildHealthCheckUrl.
           • StepReviewComplete: displays "every {interval}s · timeout {timeout}s ·
             alert after {failureThreshold} failures" (pre-persistence preview).
           • resolveHealthCheck / buildCanonicalConfiguration: normalize + preview checkUrl.
```

**Written but never consumed at runtime:** `intervalSec` (displayed, never used to schedule — no scheduler exists), `failureThreshold` (displayed, never applied — reconcile opens on first unhealthy reading), `targetType` (displayed as label only, never branches logic). `method` values `"port"`/`"container"` are stored and displayed but have **no probe implementation** — `runConfiguredHttpCheck` rejects non-`http` with "This project has no HTTP health check configured."

### Q7. What should be the canonical source of truth for the health target?

Existing code answer: **A. `project_configs.health`.**

Evidence: `runConfiguredHttpCheck` reads exclusively via `loadProjectConfig` (`health-actions.ts:73-74`), never from `services` (which has no URL columns at all — Q4). The `services.description` string (`Configured HTTP check: <url>`) is a *derived mirror* kept in sync on every run (`health-actions.ts:118-120`), not a source. The dashboard's "Checked URL" is derived live via `buildHealthCheckUrl(stored.targetUrl, stored.endpoint)` in both `MonitoringConfiguration.tsx:70` and `OperationalControls` gating (`page.tsx:405-408`). Every other reader (Review step, config display) goes through the same stored-health shape.

`PRODUCT DECISION REQUIRED` only for the future multi-service case (one config → many services would need a mapping table or per-service config). For Phase 1 (one canonical service), no decision is needed: read `project_configs.health`, treat `services` as derived state.

### Q8. How is the final health-check URL currently constructed?

`buildHealthCheckUrl(targetUrl, path)` — `lib/onboarding/health.ts:64-81`. Callers: `health-actions.ts:81` (probe), `configuration.ts:81` (canonical preview), `MonitoringConfiguration.tsx:70` (dashboard), `StepDepsHealth.tsx:156`, `StepEnvRuntime.tsx` (wizard previews).

- **Inputs:** raw `targetUrl` string + raw `endpoint` path string (both as stored; normalization is idempotent so stored-then-rebuilt is stable).
- **Output:** `{ url: string | null, error: string | null }`. Returns `{null, null}` when either side is empty (incomplete, not an error); `{null, error}` on validation failure; `{url, null}` on success. Success URL is a fully-normalized absolute URL string.
- **Validation:** via `normalizeHealthTarget` (must parse as `URL`, protocol `http:`/`https:` only, hostname required, **no credentials**, ≤200 chars, hash stripped) and `normalizeHealthPath` (must start with `/`, no scheme, no whitespace/`<>"/`, collapses `//`, preserves `?query`, strips `#fragment`, ≤200 chars). Legacy full-URL-in-endpoint values are split by `splitHealthEndpoint` (`health.ts:87-102`) in `normalizeHealthState` (`configuration.ts:63-75`).
- **HTTP/HTTPS:** both allowed; no HTTPS-only enforcement. `ftp:` etc. rejected.
- **Path handling:** target pathname prefix is preserved (`base = target.pathname minus trailing slashes`), endpoint path appended, duplicate slashes collapsed; query from endpoint preserved, target query is dropped (target `search` overwritten). Fragment always cleared.
- **Credentials/secrets:** rejected at three layers (normalize, split, and re-checked post-build in `health-actions.ts:99-101`).
- **Port handling:** preserved verbatim from the target URL (`new URL` round-trip); no allow/block list on ports. Any explicit port in the user URL is kept.
- **Edge cases:** empty target or path → incomplete (probe refuses with "incomplete" /úrate wizard demands both); over-length → error; credentials → error; non-http scheme → error; malformed URL → error; `//` runs collapsed; root path `/` normalizes to exactly one trailing slash (unit-tested).
- **Tests:** `tests/unit/onboarding-health.test.ts` covers join (`/` + nested path), full-URL-in-path rejection, credential/scheme rejection, Helm-templated probe paths, role preservation. No test currently feeds `buildHealthCheckUrl` output into a live fetch (that seam is the natural Phase 1 acceptance test — Q24).
- **Reuse verdict:** Yes — safely reusable by the real probe as-is. The probe already calls it and re-validates credentials and numeric fields after the build. No change needed.

---

## SECTION 4 — Real HTTP Probe Design

### Q9. What should the probe actually check?

The probe **already exists** (`health-actions.ts:140-164` + `http-check.ts`). Each item below states what the code does; nothing here is proposed behavior.

| Item | Code behavior | Verdict |
|---|---|---|
| HTTP method | `GET` hardcoded (`health-actions.ts:147`); no HEAD/POST option; no method field in config | Existing behavior supports GET only |
| GET only? | Yes — no other method is reachable | Existing behavior supports GET only |
| Expected status | `Number(health.expectedStatus)`; runtime accepts any integer 100–599 (`health-actions.ts:85-88`); wizard validation allowlists `200,201,202,204,301,302` but stored values outside that (e.g. legacy) still probe — they just classify accordingly | Existing behavior supports configurable expected status |
| Timeout | `timeoutSec` from config, integer 1–120 else fallback 5000ms; enforced via `AbortController` + `setTimeout` (`health-actions.ts:89-91,141-142`) | Existing behavior supports configurable timeout |
| Redirect behavior | `redirect: "manual"` — redirects are NOT followed; a 3xx is classified as `warning` (unexpected vs expected) | Existing behavior supports manual-redirect-as-observation |
| Response body | Drained via `res.arrayBuffer().catch(() => null)` and **discarded** — never stored, never logged (`health-actions.ts:154`) | Existing behavior supports body-agnostic checks |
| Headers (request) | Single `User-Agent: devops-safeguard-check/1.0`; no custom headers, no accept/content negotiation | Existing behavior supports fixed UA only |
| Authentication | None. Credentials in URL are rejected at three layers; no API-key/bearer/basic/custom-header fields exist in `HealthState`, `StoredHealth`, or the probe | Phase 1 supports **public endpoints only** — `PRODUCT DECISION REQUIRED` for any authenticated-endpoint support (Q21) |
| Latency | Measured `Date.now()` around fetch, stored as `latency_ms` | Existing behavior supports latency capture |
| TLS verification | Default `fetch` behavior (verified); no `rejectUnauthorized:false` or equivalent exists | Existing behavior supports verified TLS only (no opt-out) |

### Q10. What should the probe return?

There is **no standalone `ProbeResult` type** in the codebase — and per the no-duplication rule (Q25), none should be invented. The existing vocabulary already covers it:

- Pure classification: `HttpCheckClassification = { status: "healthy"|"warning"|"critical", errorRate: number, detail: string }` (`http-check.ts:19-24`), produced by `classifyHttpStatus(statusCode, expectedStatus)` or `classifyNoResponse("timeout"|"network")`.
- Probe-local additions in `health-actions.ts:140-164`: `statusCode: number | null` (null = no response), `latencyMs: number` (wall-clock incl. DNS+TLS), `checked_url`, and the composed `detail` string `` `GET ${url} → ${…} in ${latency}ms. ${classification.detail}.` ``.
- Persistence shape (the actual "result goes here"): one `service_health_checks` row with `status=classification.status`, `source='external'`, `latency_ms`, `error_rate=classification.errorRate`, `detail` (no body, no headers, URL included), `metadata={target, path, checked_url, status_code, expected_status}`, `is_demo=false`, `checked_at=now`. Then `runMonitorTick` is invoked synchronously so detection consumes the row on the next read.

Proposed (documentation-only, no new type): treat `{ classification, statusCode, latencyMs, checkedUrl, checkedAt }` as the logical ProbeResult, reusing `HttpCheckClassification` + the existing `service_health_checks` columns verbatim. If a named type is ever wanted, it should alias these fields, not duplicate them.

### Q11. How should HTTP outcomes map to existing health states?

Implemented mapping (`http-check.ts:26-50` → `reconcile.ts:22-37` → `monitor.ts:applyDecision`):

| HTTP/Network Result | Existing Health State (`service_health_checks.status` → `services.status`) | Existing Severity (on incident open) | Reason (code) |
|---|---|---|---|
| 2xx equal to expected (e.g. 200 vs 200) | `healthy` | — (no incident; `none`) | `classifyHttpStatus`: exact match → healthy/0 |
| 2xx NOT equal to expected (e.g. 201 vs 200) | `warning` | `medium` | Any unexpected answer that is not 5xx → warning/0.5 |
| 3xx (redirect; not followed) | `warning` | `medium` | Same rule; redirects are observations, not followed (`redirect:"manual"`) |
| 4xx | `warning` | `medium` | Same rule (client error = degraded, not outage claim) |
| 5xx | `critical` | `critical` | `statusCode >= 500` → critical/1 |
| timeout (AbortError at timeoutMs) | `critical` | `critical` | `classifyNoResponse("timeout")` → critical/1; "missing answer is information, not unknown" |
| DNS failure / connection refused / refused-preflight | `critical` | `critical` | `classifyNoResponse("network")` → critical/1; DNS-unresolvable / non-public host refused pre-fetch with an operator-facing error and **no observation row** (see Q20) |
| malformed URL / invalid expected status / non-http method configured | (no observation; action returns `{ok:false, error}`) | — | Guard clauses `health-actions.ts:75-101`; nothing is persisted, nothing ticks |

Notes: `unknown`, `maintenance`, and `recovering` are **never produced by the probe** — they arise from null status (never observed), manual/legacy state, and the verification flow respectively. Severity mapping is `severityForStatus`: `critical→critical`, `warning→medium`, anything else `→low` (unreachable from probe). No `PRODUCT DECISION REQUIRED` on this table — the mapping is fully determined by existing code. The one open product question is Q13 (whether first-failure-should-alert vs threshold — currently first failure opens).

---

## SECTION 5 — Timeout, Failure Threshold & Interval

### Q12. Where are timeout, interval and failure threshold currently stored?

| Value | UI → validation → database → runtime | Consumed? |
|---|---|---|
| `timeoutSec` | `StepDepsHealth` numeric field → `validateHealth` (int 1–120) + `validateOnboardingPayload` → `project_configs.health.timeoutSec` (string) → `normalizeStoredHealth` → `runConfiguredHttpCheck` (`Number(timeoutSec)`, fallback 5000ms) → `AbortController` | **Yes — the only one of the three that affects execution.** |
| `intervalSec` | Same path (`validateHealth` int 10–3600) → `project_configs.health.intervalSec` → `normalizeStoredHealth` → displayed in `MonitoringConfiguration` ("Interval: Ns") and Review preview ("every Ns") | **No — never read by any runtime code.** No scheduler/cron/worker exists (Q1). Grep confirms zero consumers outside display/validation. |
| `failureThreshold` | Same path (`validateHealth` int 1–10) → `project_configs.health.failureThreshold` → displayed ("Failures to alert: N") | **No — never read by any runtime code.** `reconcileService` opens an incident on the **first** unhealthy observation when no incident is active (`reconcile.ts:98-111`); there is no consecutive-failure counter anywhere. |

### Q13. How should `failureThreshold` interact with the existing detection engine?

Current engine behavior (`reconcile.ts` + `monitor.ts`):

- `reconcileService` is **stateless across ticks**: its only inputs are current observed status + active incident + active verification. It reads the **single latest** `service_health_checks` row (`monitor.ts:latestCheck`), not a window. There is no consecutive-failure counter, no flapping damper, no threshold check.
- Incident creation: first unhealthy observation with no active incident → `open_incident` immediately. Dedup thereafter (`record_ongoing`) while unhealthy.
- Verification (the recovery side) **does** have a consecutive-success concept: `DEFAULT_VERIFICATION_CHECKS = 3`, tracked in `verification_runs.checks_passed`, advanced/reset per tick.

Where the threshold would have to be applied (not implemented): between `latestCheck` and `reconcileService` in `runMonitorTick` — e.g. count consecutive non-healthy observations for the service (ordered by `checked_at desc`, bounded by `failureThreshold`) and only pass the unhealthy status to `reconcileService` once the count reaches the threshold, otherwise hold current state. Alternatives (all requiring schema or logic additions): a `consecutive_failures` column on `services`; a dedicated pre-reconcile gate function reusing the `service_health_checks_service_time_idx` index. The existing state machine has **no slot** for this today — the verification counter is the closest analog but runs on the recovery path, not the alerting path. Do not implement; this is a Phase-1-scope decision (Q27 recommends deferring threshold enforcement — the stored value stays display-only until then).

### Q14. How should recovery work?

Existing recovery/verification logic is complete and reusable as-is (`reconcile.ts:113-163` + `monitor.ts:246-339`):

```
healthy observation, no incident        → none (service stays healthy)
unhealthy observation, no incident      → open_incident (service = warning|critical)
healthy observation, incident active,   → begin_verification (service = recovering,
  no verification running                 incident → monitoring, verification_run
                                          created with checks_required = 3, checks_passed = 1)
healthy observation, verification       → advance_verification (checks_passed + 1;
  running                                 service = recovering) until checks_passed >=
                                          checks_required → confirm_recovery
                                          (verification passed, incident resolved,
                                           remediation verified if linked)
unhealthy observation, verification     → reset_verification (checks_passed = 0;
  running                                   service = unhealthy; incident stays active)
unknown/maintenance/recovering observed → hold (none; neither advance nor reset)
```

Phase 1 reuses this **unchanged**: a recovered endpoint returns the expected status → probe writes `healthy`/`external` → tick begins/advances verification → after 3 consecutive healthy ticks the incident resolves. Nothing is missing for the manual-trigger (one-click-per-check) flow. What is missing only matters for automation: nobody runs the 3 ticks on a timer yet (Phase 2 scheduler). `PRODUCT DECISION REQUIRED` only on whether `failureThreshold` should also gate the *recovery* path (currently hardcoded 3, independent of the stored threshold).

---

## SECTION 6 — Database & Persistence

### Q15. Where should a real probe observation be stored?

**Table: `service_health_checks`** (`20261002000000_detection_and_verification.sql:24-48`; types in `database.types.ts:589-645`). This is already what the real probe does. Column mapping:

| Concept | Column | Type / constraint | How the real probe fills it (`health-actions.ts:166-183`) |
|---|---|---|---|
| status | `status` | text CHECK `healthy,warning,critical,unknown,maintenance,recovering`, NOT NULL | `classification.status` (healthy/warning/critical only) |
| latency | `latency_ms` | integer ≥ 0, nullable | wall-clock ms around `fetch` |
| errors | `error_rate` | numeric(5,4) 0–1, nullable | `classification.errorRate` (0 / 0.5 / 1 single-sample mapping) |
| error/detail text | `detail` | text, nullable | `GET <url> → HTTP <code>\|no response in <ms>ms. <classification.detail>.` (no body/headers/secrets) |
| source | `source` | text CHECK `probe,synthetic,external,simulation`, default `probe`, NOT NULL | `'external'` — the marker that distinguishes real user-configured checks |
| project/service association | `project_id` FK→projects, `service_id` FK→services, both cascade delete | set to the tick's project + the canonical "Application endpoint" service |
| timestamps | `checked_at` timestamptz default `now()` | explicit `new Date().toISOString()` |
| HTTP specifics | `metadata` jsonb, nullable | `{target, path, checked_url, status_code (null on no-response), expected_status}` |
| demo marking | `is_demo` boolean default false | `false` on the real path |

Related tables the probe does NOT write directly (the tick writes them): `services.status`, `incidents`, `incident_events`, `incident_evidence`, `verification_runs`, `projects.(health,service_count,active_incident_count,last_checked_at)`.

### Q16. What currently writes `service_health_checks`?

| Writer (file:line) | `source` | `is_demo` | Category | Keep for Phase 1? |
|---|---|---|---|---|
| `health-actions.ts:166` `runConfiguredHttpCheck` | `external` | false | **REAL** — live HTTP GET against user config | **Yes — the Phase 1 path.** |
| `monitor.ts:406` self-copy probe in `runMonitorTick` | `probe` | inherits service | **SELF-COPY** — re-inserts the *already-stored* effective status with `detail='monitor probe'` whenever a service is unhealthy or has an active incident, so each verification step has a fresh timestamp | Keep — it is what advances verification on manual "Run monitor check" ticks; do NOT mistake it for a network probe (it performs no I/O) |
| `incidents/actions.ts:188` `setupDemoScenario` | `synthetic` | true | **DEMO** — baseline healthy checks for web/api/database | Keep (dev-only, labelled); must NOT be used for real path |
| `incidents/actions.ts:270` `simulateControlledFailure` | `simulation` | true | **SIMULATION** — controlled critical on demo `api` | Keep (dev-only); must NOT be used for real path |
| `remediation/engine.ts:71` via `recordCheck` (RESTART/ROLLBACK cases) | `simulation` | inherits action | **REMEDIATION** (simulated recovery signal) | Keep; demo-only by design |
| `remediation/engine.ts:71` via `recordCheck` (RETRY case) | `probe` | inherits action | **REMEDIATION** (re-probe = re-read current status, changes nothing) | Keep; not a network probe |
| `supabase/seed-remote-demo.sql:163-189` | `simulation` | true | **DEMO** seed data | Keep out of real path |
| `supabase/tests/*.sql` | various | — | Test fixtures | Keep out of real path |

Rule for Phase 1: only rows with `source='external'` AND `is_demo=false` are real observations. The dashboard incident timeline already surfaces `detail`/`metadata`; no writer changes needed.

### Q17. Is the existing schema sufficient for Phase 1?

**Yes — no migration is required for Phase 1.** Every required concept has a column (Q15 table): real observation (`source='external'` + `is_demo=false`), HTTP status (`metadata.status_code` + `detail`), latency (`latency_ms`), failure (`status=critical`), timeout (`status=critical` + `detail='No HTTP response before the timeout'`), network error (`status=critical` + `detail='No HTTP response (connection failed)'`), source (`source` CHECK already includes `external`), timestamp (`checked_at`). Indexes needed by the detector already exist (`service_health_checks_service_time_idx`, `service_health_checks_project_time_idx`).

Exact proposed migration changes: **none.** If a future phase wants first-class columns (e.g. `status_code integer`, `consecutive_failures`, per-service config FK), that is Phase 3 hardening, not Phase 1. Do not create a migration.

One honest gap (not a schema gap): `project_configs.monitoring_status` is never transitioned to `'active'` — nothing writes it after the first real check (Q1/Q12; `actions.ts:352-355` deliberately leaves the default `'pending'`). The dashboard therefore shows "First check pending" forever even after successful probes. Fix is a one-row update in the probe success path, not a schema change — listed in the blueprint as optional Phase 1 polish.

---

## SECTION 7 — Existing Detection System

### Q18. How does a health observation become an incident today?

Exact call chain (all verified in code):

```
service_health_checks row (any writer, Q16)
  ↓ lib/detection/monitor.ts:runMonitorTick — latestCheck() (74-88: latest row by
    checked_at desc) → effectiveStatus = latest?.status ?? service.status ?? "unknown"
  ↓ optional self-copy probe insert (405-417) when unhealthy-or-active-incident
  ↓ activeIncidentFor() (96-111: newest non-resolved incident for project+service)
  ↓ runningVerificationFor() (121-134: running verification_runs row for incident)
  ↓ lib/detection/reconcile.ts:reconcileService (pure; inputs above) → ReconcileResult
    { serviceStatus, action: none | open_incident | record_ongoing |
      begin/advance/reset_verification | confirm_recovery }
  ↓ monitor.ts:applyDecision (183-346)
      open_incident → incidents insert (severity from severityForStatus, title
        "<name> is failing health checks|<name> is degraded") + incident_events
        'detected' + incident_evidence 'metric' snapshot + deployment evidence snapshot
      begin/advance/reset/confirm → verification_runs + incidents.status +
        incident_events rows as in Q14
  ↓ services.status persisted when changed (460-465)
  ↓ projects rollup (470-485): active incident count → worst-first health
    (critical>warning>recovering>maintenance>unknown>healthy) → projects.health,
    service_count, active_incident_count, last_checked_at
  ↓ dashboard re-read (page.tsx) + revalidatePath; incident detail via loadIncidentBundle
```

Files: `lib/detection/monitor.ts`, `lib/detection/reconcile.ts`, `lib/incidents.ts` (severity/status vocab), `app/projects/[id]/health-actions.ts` (real entry), `app/projects/[id]/incidents/actions.ts` (other entries), `lib/incidents/load.ts` (read side).

### Q19. Can the existing detection system consume a real probe result without being rewritten?

**YES.**

Why: `runMonitorTick` reads only the generic `service_health_checks` row shape (`status, latency_ms, error_rate, detail`) and the `services/incidents/verification_runs` state — it never inspects `source` or `metadata`. A `source='external'` row with `status ∈ {healthy, warning, critical}` is indistinguishable (by design) from the synthetic/simulation rows the detector was built and unit-tested against (`reconcile.test.ts`, 17-test suite green per repo scripts). The wiring that proves it — probe insert → synchronous `runMonitorTick` → `activeIncidentOnService` → revalidate — is already implemented (`health-actions.ts:166-204`) and the classification values it writes are exactly the states the state machine handles (Q11). No detector change, no schema change, no new mapping table is needed. Prefer reuse: the detector stays untouched.

---

## SECTION 8 — Security

### Q20. What security risks are introduced by making the server request user-provided URLs?

Context: `runConfiguredHttpCheck` performs a server-side `fetch` of a URL derived from user-supplied onboarding fields (`targetUrl` + `endpoint`). Findings, separated as requested:

**Already protected (verified in code):**

- URL shape: `normalizeHealthTarget` enforces absolute `http(s)` URL with hostname, ≤200 chars; `normalizeHealthPath` confines the endpoint to a path; credentials in URL rejected at normalize (`health.ts:41-46`), at legacy-split (`health.ts:96`), and re-checked post-build in the action (`health-actions.ts:99-101`).
- Structurally-internal hostnames: `isBlockedHostname` (`http-check.ts:65-69`) rejects `localhost`, `metadata.google.internal`, and suffixes `.local/.localhost/.internal/.invalid/.test/.example/.svc.cluster.local` — **without any DNS lookup**. Unit-tested (`http-check.test.ts:42-49`).
- Resolved-address filtering: `resolvePublicHost` (`health-actions.ts:45-60`) does `dns.lookup(all:true)` and rejects if **any** resolved address is non-public via `isBlockedAddress` (IPv4 private/loopback/link-local/multicast/CGNAT/test-net + IPv6 `::1/::`, `fe80::/10`, `fc00::/7`, `ff00::/8`; `http-check.ts:71-105`). Unresolvable host → clean operator error, no fetch, no observation row. Unit-tested (`http-check.test.ts:51-57`).
- Redirects: `redirect: "manual"` — the server never follows 3xx to an attacker-chosen or internal location; the 3xx itself is the observation.
- Body/secret hygiene: response body drained and discarded, never stored/logged; only status/latency/URL persisted. Secret *values* never enter this path (names + presence only, end to end).
- Transport: default verified TLS; no insecure opt-out exists. Method fixed to GET with a static UA; no header/credential injection surface.
- AuthZ: RLS + `canSeeProject` gate the action; the probe can only run against projects the caller belongs to, and writes are scoped to that project.

**Missing protection:**

- No explicit port allow/block list — any explicit port in the target URL is preserved (`new URL` round-trip). Probing `https://public-host:22/` etc. will attempt a connection (harmless in practice — TLS/HTTP handshake fails → `critical`/`network` — but it is an untargeted-connection surface).
- DNS-rebinding TOCTOU: hostname is resolved for the allow-check, then `fetch` resolves again independently. A hostile hostname flipping from public to internal IP between the two resolutions is not pinned (no dialer-level `lookup` override or IP pinning). Standard low-severity SSRF follow-up.
- No rate limiting / per-project cooldown on the action — a signed-in member can trigger arbitrary numbers of outbound probes (self-inflicted egress/cost surface; no loop or amplification, but no throttle either).
- `http:` (plaintext) targets are allowed, so check traffic to user-chosen hosts can traverse plaintext (operator's choice, displayed back as the checked URL — not a server-side leak, but worth noting).

**Product/security decision required:**

- Whether plaintext-`http` targets should be warned/blocked, whether a port allowlist (80/443 + explicit override) is wanted, whether DNS-pinning or a dedicated egress proxy is in scope for production hardening, and what probe rate limits / audit logging the hosted offering needs. None of these block Phase 1 manual triggering in a trusted-operator context; all belong to Phase 3 hardening (Q27).

---

## SECTION 9 — Secrets & Authentication

### Q21. Does the health endpoint require authentication?

Investigated: `HealthState` (`types.ts:330-343`), `StoredHealth` (`stored-config.ts:34-43`), wizard UI (`StepDepsHealth.tsx`), validation (`validation.ts`), probe (`health-actions.ts:140-164`), env/secret handling (`storage.ts`, `actions.ts:372-400`, `project-config.ts:57-62`).

- The system has **no fields** for API keys, bearer tokens, basic credentials, or custom headers on health checks. The only secret-adjacent concept (`project_env_vars` + wizard Environment step) stores **names + presence only** and is never read by the probe.
- Credentials embedded in the target URL are **explicitly rejected** at three layers (Q20).
- Therefore Phase 1 supports **public (unauthenticated) endpoints only** — e.g. public `/healthz`, status pages, tunnel URLs. This matches the existing code with zero additions.

`PRODUCT DECISION REQUIRED` for anything beyond public endpoints: where credentials would be stored (new secret store vs existing env-var names), how they would be injected (header template vs basic auth), who may view/rotate them, and whether per-service credentials are needed. Explicitly out of Phase 1 scope; do not invent a credential architecture.

---

## SECTION 10 — Testing

### Q22. What testing infrastructure already exists?

| Capability | Implementation | Verdict |
|---|---|---|
| Unit tests | `node:test` + `node:assert/strict`, compiled via `tsc -p tsconfig.test.json` into `.test-build/`, run with `node --test ".test-build/tests/unit/*.test.js"` (`package.json:14-16`; `test:unit`, `test`) | Exists, 17 files: reconcile, http-check, onboarding-health/validation/configuration/presets/ports/commands/analyze/failures/provenance/dependencies, dotenv, remediation-allowlist, ai-schema, deterministic-provider, analysis-discovery |
| Integration (DB) | `supabase/tests/*.sql` (`00_auth_stub`, `01_rls_and_telemetry`, `02_incident_domain_rls`, `03_onboarding_rls`) run via `supabase/tests/run.ps1` (`test:db`) / `run.sh` (`test:db:sh`) against a live/linked Supabase | Exists for RLS + schema; no probe integration test yet |
| E2E (browser) | No Playwright/Vitest/Cypress config in repo (`playwright*` glob: no files; only `.gitignore` entries + transitive `package-lock` mention). `components/incidents/IncidentPoller.tsx` polls; no E2E harness | **Does not exist** |
| HTTP mock/stub | None (no msw/nock/undici-mock in `package.json`; Node ≥18 global `fetch` is used directly) | Does not exist — but nothing prevents `node:http` local servers in `node:test` (stdlib only, no new dependency — Q23) |
| Typecheck/lint | `tsc --noEmit` (`typecheck`), `next lint` (`lint`), combined `verify` — per RULE.md §18, use `verify`, never `next build` with dev running | Exists |

### Q23. How can Phase 1 be tested without relying on a real external production website?

Best existing mechanism: **`node:test` + stdlib `node:http` local server** (no new dependency, consistent with the repo's zero-test-dependency posture and RULE.md §14).

Pattern (not added — description only): in a new `tests/unit/*.test.ts` (or an integration test file compiled by the same `tsconfig.test.json`), `createServer` serving deterministic routes (`/healthy → 200`, `/degraded → 500`, `/slow → delayed beyond timeout`), listen on `127.0.0.1:0`, then exercise the **pure seams that already exist**: `buildHealthCheckUrl` (URL join), `classifyHttpStatus`/`classifyNoResponse` (mapping), `resolvePublicHost`-adjacent guards at the hostname level (`isBlockedHostname`/`isBlockedAddress` — note: `127.0.0.1` is correctly *blocked* by the SSRF guard, so a live-fetch test through `runConfiguredHttpCheck` itself cannot target localhost by design; test the fetch+classify composition against the local server in-process, and test `runConfiguredHttpCheck`'s DB effects against a Supabase test project with a public test URL or by asserting the guard paths). This keeps the suite deterministic with no external network and no new packages. Playwright/E2E is not required for Phase 1.

### Q24. What should the minimum Phase 1 acceptance test be?

Because the flow already exists, acceptance is **verification**, not construction. Deterministic minimum (manual or scripted against a dev Supabase):

**Happy path (real success observed end-to-end):**

```
[ ] onboard a project via the wizard with method=http, targetUrl=<public test URL>,
    endpoint=/health (or equivalent 200 route), expectedStatus=200, timeoutSec=5
[ ] assert project_configs.health stores the 8 fields verbatim; services table has NO row yet
[ ] click "Run HTTP check" (runConfiguredHttpCheck)
[ ] assert ONE new service_health_checks row: source='external', is_demo=false,
    status='healthy', latency_ms>=0, error_rate=0, metadata.status_code=200,
    metadata.checked_url=<built URL>, detail contains "GET <url> → HTTP 200"
[ ] assert ONE services row created/kept: name="Application endpoint",
    kind="http-endpoint", is_demo=false, description names the checked URL
[ ] assert runMonitorTick ran (projects.last_checked_at advanced; no incident opened)
[ ] assert dashboard shows the service (Unknown→Healthy), MonitoringConfiguration
    shows the stored config + derived Checked URL, "Run HTTP check" remains available
```

**Failure → recovery (detector decides, not the button):**

```
[ ] point the test target at a 500 route (or stop the server) → "Run HTTP check"
[ ] assert observation status='critical'/error_rate=1 → detector opened ONE incident
    (severity critical, title "Application endpoint is failing health checks",
    evidence "Health check reading" + deployment snapshot when present)
[ ] run "Run HTTP check" again while still failing → assert NO duplicate incident
    (record_ongoing dedup; single active incident)
[ ] restore 200 → "Run HTTP check" ×3 (or monitor ticks) → assert incident passes
    through monitoring/verifying → resolved, service Healthy, dashboard reflects it
```

Each `[ ]` is objectively checkable in Supabase Studio + the dashboard. No external production website is needed if the "public test URL" is a stable test endpoint under the operator's control (or a tunneled local server — any publicly-resolving, publicly-routed URL passes the SSRF guard).

---

## SECTION 11 — Collision & Duplication Audit

### Q25. Are there already functions/types that overlap with a proposed probe implementation?

Yes — the probe is implemented, so the audit direction reverses: the future agent must **reuse** these and create **no duplicates**:

| Proposed concept | Existing code that already covers it — REUSE, do not duplicate |
|---|---|
| Probe / health check runner | `runConfiguredHttpCheck` (`health-actions.ts:62`) — the IO action; `runProjectMonitor`/`runMonitorTick` for tick-only |
| Health-check URL builder | `buildHealthCheckUrl` + `normalizeHealthTarget` + `normalizeHealthPath` + `splitHealthEndpoint` (`lib/onboarding/health.ts`) |
| HTTP→status classification | `classifyHttpStatus` + `classifyNoResponse` (`lib/monitoring/http-check.ts:26-50`) |
| SSRF guards | `isBlockedHostname` + `isBlockedAddress` (`http-check.ts:64-105`) + `resolvePublicHost` (`health-actions.ts:45-60`) |
| Health states | `ServiceStatus` / `ProjectHealth` (`lib/incidents.ts:17`, `lib/projects.ts:10-16`); severity via `severityForStatus` (`reconcile.ts:33-37`) |
| Observation / check record | `service_health_checks` row + `toServiceHealthCheck` / `ServiceHealthCheck` (`lib/incidents.ts:418-429,532-548`); `HealthCheckSource` union already includes `external` (`lib/incidents.ts:275`) |
| Monitor / tick | `runMonitorTick` (`monitor.ts:349`) + `reconcileService` (`reconcile.ts:92`) + `MonitorTickResult` |
| Validation | `validateHealth` + `validateOnboardingPayload` (`validation.ts`); wizard + server boundary share one rule |
| Stored config shape | `StoredHealth` + `normalizeStoredHealth` (`stored-config.ts`); read via `loadProjectConfig` (`project-config.ts`) |
| Timeout/latency/error detail | Existing `timeoutSec→AbortController`, `latency_ms`, `error_rate`, `detail`, `metadata` conventions in `health-actions.ts` |
| Auth/access | `authed()` + `canSeeProject` (`incidents/actions.ts:37-76`, shared with health-actions) |

Must NOT create: a second URL builder, a second status enum, a second classification function, a second monitoring function, a second observation table/model, a second validation rule, or a `ProbeResult` type that duplicates `HttpCheckClassification` + `service_health_checks` columns. The only justifiable new file would be a test file (Q23/Q24).

### Q26. Where should the new probe module logically live?

No new probe module is needed — and the hypothetical `lib/detection/probe.ts` should **not** be created. Evidence for keeping the current locations:

- Pure network-agnostic logic already lives in the conventional pure-core location: `lib/monitoring/http-check.ts` (classification + SSRF predicates, unit-tested, zero I/O imports) — exactly where repo convention puts deterministic cores (`lib/detection/reconcile.ts`, `lib/onboarding/*`).
- Server-side I/O already lives in the conventional server-action location: `app/projects/[id]/health-actions.ts` (auth, DNS, fetch, inserts, tick, revalidation colocated with the dashboard that triggers it, sharing `authed`/`canSeeProject` with the sibling `incidents/actions.ts`).
- `lib/detection/monitor.ts` is deliberately the source-agnostic IO shell (it reads rows, never the network) — pushing fetch into it would break the OBSERVE→DETECT layering its header comment enforces.
- Moving the fetch into `lib/` would also strand the `"use server"` + `node:dns` + `revalidatePath` dependencies in a non-action module for no benefit.

Recommendation: keep `lib/monitoring/http-check.ts` (pure) + `app/projects/[id]/health-actions.ts` (IO). If a future refactor extracts the fetch for scheduler reuse (Phase 2), extract a `runConfiguredHttpCheckForProject(supabase, projectId)` helper *from* the existing action into `lib/monitoring/` — do not write a parallel implementation.

---

## SECTION 12 — Phase 1 Boundary

### Q27. What should explicitly NOT be implemented in Phase 1?

**Phase 1 (manual real monitoring works — ALREADY TRUE; remaining work is verify + close gaps):**

- Real HTTP GET of the configured target + classification + `source='external'` persistence (`health-actions.ts` — exists, verify per Q24)
- Manual trigger via existing "Run HTTP check" button (exists, verify)
- Detection/incident/verification/recovery reuse with zero detector changes (exists, verify failure→recovery path)
- Dashboard visibility of service + config + incidents (exists, verify)
- Optional polish within Phase 1 scope: transition `project_configs.monitoring_status` to `'active'` on first successful real check; surface probe errors honestly in UI (both are row-updates/text, not architecture)

**Phase 2 (scheduler / automation — explicitly NOT Phase 1):**

- cron / `setInterval` / Vercel Cron / pg_cron / any background worker or queue
- Automatic multi-project execution loop ("check all projects every N seconds")
- Consumption of `intervalSec` for scheduling (read the stored value on a timer)
- Enforcement of `failureThreshold` as consecutive-failure gating (Q13 design + implementation)
- Retry/backoff policy, notification dispatch (no notifier exists — `PROJECT_CURRENT_STATE.md:314`)
- Scheduler observability (last-run, next-run, per-project cadence state)

**Phase 3 (production hardening & breadth — explicitly NOT Phase 1 or 2):**

- SSRF hardening beyond current guards: port allowlists, DNS-pinning/rebinding defense, egress proxy, plaintext-http policy, rate limiting, probe audit log (Q20 missing items)
- Authenticated endpoints: API-key/bearer/basic/custom-header credential architecture (Q21 decision)
- `port` / `container` method probes (stored methods with no implementation today)
- Multi-service real monitoring (one config → many services mapping)
- Advanced observability: metrics backends, log/trace ingestion, collectors, WebSocket/SSE live streams
- Advanced dashboard features beyond current cards/lists; final deployment-readiness (secrets rotation, hosted RLS review, load testing)

---

## PHASE_1_IMPLEMENTATION_BLUEPRINT

### 1. Files that should be modified

| File | Why | Expected change |
|---|---|---|
| *(none required for the core flow)* | The probe → persist → detect → dashboard chain is complete and wired | Verify only (Q24 checklist) |
| `app/projects/[id]/health-actions.ts` — OPTIONAL polish | `monitoring_status` stays `'pending'` forever even after real checks (Q17 gap); dashboard badge never leaves "First check pending" | On successful real observation, `update project_configs set monitoring_status='active'` (and `'degraded'` only if a future definition exists — else leave status transitions minimal). Small, additive, no signature changes. |
| `components/projects/OperationalControls.tsx` + `app/projects/[id]/page.tsx` — ONLY if polish above lands | Surface the first-check transition / probe error text honestly | Text/conditional only; no new buttons or routes. |

Only list genuinely necessary changes: the core flow needs **zero** file modifications. Any agent proposing edits beyond the optional `monitoring_status` row-update is out of scope and must justify against Q25 (no duplicates).

### 2. Files that should be created

| File | Purpose |
|---|---|
| *(none required)* | No new probe, detector, schema, or route file is needed. |
| `tests/unit/http-probe-integration.test.ts` — OPTIONAL, recommended | Deterministic local-`node:http`-server test of the fetch→classify→persist seam (Q23 pattern); stdlib only, no new dependencies. The only justifiable new file. |

Do not create `lib/detection/probe.ts`, a `ProbeResult` type file, a scheduler, a worker, or any migration for Phase 1.

### 3. Database changes

```text
Migration: none required
Purpose:    n/a — schema already sufficient (Q17)
Tables affected: none
Columns:    none
Indexes:    none (service_time + project_time indexes exist)
Constraints: none (source CHECK already includes 'external'; status CHECK covers probe outputs)
```

Best-effort data hygiene only (not a migration): confirm `project_configs.monitoring_status` default `'pending'` + allowlist intact; confirm no `services` rows are created at onboarding (lazy creation on first probe is intended).

### 4. Final data flow

```text
[existing] wizard UI (components/onboarding/steps/StepDepsHealth.tsx)
        ↓ HealthState {method,targetUrl,endpoint,expectedStatus,intervalSec,timeoutSec,failureThreshold}
[existing] validateHealth + validateOnboardingPayload (lib/onboarding/validation.ts)
        ↓
[existing] createProjectFromOnboarding (app/projects/actions.ts)
        ↓ projects row + project_configs.health JSONB + project_env_vars (names only)
[existing] loadProjectConfig (lib/project-config.ts) → StoredHealth
        ↓
[existing] buildHealthCheckUrl (lib/onboarding/health.ts) → checked URL
        ↓
[existing] runConfiguredHttpCheck (app/projects/[id]/health-actions.ts)
           ├─ resolvePublicHost (dns.lookup + isBlockedAddress/isBlockedHostname)
           ├─ find-or-create services row ("Application endpoint", kind http-endpoint)
           ├─ fetch GET redirect:manual + AbortController(timeoutSec) → statusCode/latencyMs
           ├─ classifyHttpStatus / classifyNoResponse (lib/monitoring/http-check.ts)
           └─ insert service_health_checks (source='external', is_demo=false, +metadata)
        ↓
[existing] runMonitorTick (lib/detection/monitor.ts)
        ↓ latestCheck + activeIncidentFor + runningVerificationFor
[existing] reconcileService (lib/detection/reconcile.ts — PURE, untouched)
        ↓
[existing] applyDecision → incidents / incident_events / incident_evidence /
           verification_runs / services.status → projects rollup (health, counts, last_checked_at)
        ↓
[existing] dashboard re-read (app/projects/[id]/page.tsx + MonitoringConfiguration +
           OperationalControls) + revalidatePath
```

Every box is an actual file/function name. No `[new component]` boxes exist for Phase 1.

### 5. Phase 1 acceptance criteria

```text
[ ] Onboarding stores health config: project_configs.health contains the 8 wizard fields verbatim; monitoring_status='pending'; no services row exists yet
[ ] buildHealthCheckUrl(targetUrl, endpoint) returns the exact URL shown as "Checked URL" on the dashboard
[ ] "Run HTTP check" against a public 200 endpoint writes exactly one service_health_checks row with source='external', is_demo=false, status='healthy', error_rate=0, latency_ms>=0, metadata={checked_url,status_code:200,expected_status:200}
[ ] The canonical services row exists: name="Application endpoint", kind="http-endpoint", is_demo=false, description names the checked URL; re-running does not duplicate it
[ ] Detection consumed the row with no code changes: projects.last_checked_at advanced; no incident opened on healthy; dashboard service shows Healthy
[ ] Failure path: 500/timeout/unreachable target writes status='critical' (error_rate=1) and the detector opens exactly one incident (severity critical, title names the service, metric evidence + detected event present)
[ ] Dedup: a second failing check does not open a second incident (single active incident; record_ongoing)
[ ] Recovery path: restored 200 over 3 consecutive checks moves incident open→monitoring/verifying→resolved and service →Healthy (DEFAULT_VERIFICATION_CHECKS honored)
[ ] SSRF guards hold: localhost/private-suffix target refused pre-DNS; DNS-resolving-to-private refused post-lookup; credentials-in-URL refused; redirect targets never fetched (3xx recorded as warning); bodies never persisted
[ ] Non-HTTP methods honestly refused: method=port/container → "no HTTP health check configured" error, no observation row, no incident
[ ] npm run verify (tsc --noEmit + next lint) passes; npm run test:unit passes with no new failures
[ ] No new migration, no new dependency, no scheduler/worker/cron, no credential architecture, no duplicate URL-builder/status-enum/monitor-function introduced
```

### 6. Known ambiguities

```text
## PRODUCT DECISIONS REQUIRED
1. Failure-threshold semantics: should the FIRST unhealthy probe open an incident (current behavior) or should N consecutive failures be required (stored failureThreshold, currently display-only)? If N: what counts (probe ticks only, or all observations incl. self-copy rows?), and does the counter reset on any healthy row? (Q12/Q13)
2. Recovery quorum vs threshold: should verification keep the hardcoded 3 consecutive healthy checks (DEFAULT_VERIFICATION_CHECKS) or follow the stored failureThreshold / a separate recoveryThreshold? (Q14)
3. monitoring_status lifecycle: what transitions 'pending'→'active' (first successful check? first tick?), and what (if anything) sets 'degraded' vs deriving it from projects.health? (Q15/Q17)
4. Authenticated endpoints: is there a Phase-2+ requirement for API-key/bearer/basic/custom-header health checks, and where would credentials live? Phase 1 = public only. (Q21)
5. Plaintext http + arbitrary ports: warn, allow, or block in production? Any port allowlist or DNS-pinning requirement for the hosted offering? Rate limits / audit log for probe execution? (Q20)
6. Multi-service future: does one project ever map to >1 real probed service, and if so what is the per-service config source? Out of Phase 1 regardless. (Q3/Q5/Q7)
```

No other product decisions are needed for Phase 1 — the URL model, classification mapping, incident lifecycle, and dashboard contract are all determined by existing code.

---

## Implementation Confidence

**92 / 100** — "How confidently can a future implementation agent implement Phase 1 from this investigation without making architectural assumptions?"

Rationale: the entire intended data flow exists, is file-and-line cited, has unit coverage on every pure seam (URL building, classification, SSRF predicates, validation, reconcile), and the acceptance checklist is executable against the current code with no guessing. The 8 points withheld are exactly the six product decisions above (threshold semantics, recovery quorum, status lifecycle, auth future, port/plaintext policy, multi-service future) plus one verification caveat: this investigation did not execute the live probe against a network target (per the investigation-only constraint), so the final `[ ]` boxes in §5 still require one operator run of Q24 to confirm end-to-end behavior in the deployment environment. Nothing architectural is missing; nothing needs to be invented.
