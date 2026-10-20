# DevOps Safeguard — Feature Status Audit: Real-App Monitoring → Detection → Diagnosis → Remediation → Verified Recovery

**Date:** 2026-10-16
**Scope:** Can the current codebase independently monitor deployed Podinfo 6.15.0, detect failures, create incidents, diagnose, remediate, verify recovery, and resolve — via dashboard + monitoring worker?
**Method:** Static code audit only. No application code modified. No database writes. No Podinfo failure triggered. No network calls to Podinfo/worker made during this audit. Live Podinfo/worker facts in §3 are taken as given environment context, not as proof of code compatibility.
**Deliverable path:** `FEATURE_STATUS_AUDIT.md` (repository root; the only file created by this task).

---

## 1. Executive summary

The monitoring → detection → verification → resolution pipeline is **real, implemented, and unit-tested** — but it **cannot monitor the stated Podinfo target today without a code change**, and remediation/AI are narrower than the desired journey implies.

| Claim | Status |
|---|---|
| Dashboard can configure + display a real HTTP health check (target, path, expected status, timeout, interval, threshold) and persists it correctly | `VERIFIED IN CODE` — YES |
| Worker + scheduler can make real HTTP requests and persist genuine observations | `VERIFIED IN CODE` — YES (for public targets) |
| `http://172.31.30.138` + `/` reaches Podinfo through the Safeguard pipeline | `BLOCKED` — NO (SSRF gate refuses it; see §6) |
| Repeated HTTP 500 → exactly one incident; recovery after N healthy → resolved | `VERIFIED IN CODE` with a concurrency caveat (`PARTIALLY IMPLEMENTED` hardening missing) |
| Dashboard displays the real incident/health/verification state | `VERIFIED IN CODE` — YES |
| Diagnosis executes automatically after incident creation | NO — button-triggered only (`PARTIALLY IMPLEMENTED`) |
| Remediation fixes real Podinfo failures | NO — demo/simulated state only, human-gated, no Kubernetes client |
| Full desired demo works today with zero code changes | NO |

**Single most important blocker (§15 P0-1):** `resolvePublicHost()` in `lib/monitoring/external-check.ts:60-75` refuses the private target `172.31.30.138` (172.16/12 branch of `isPrivateIPv4`, `lib/monitoring/http-check.ts:76`). The onboarding wizard *accepts* the URL, but the worker *never fetches it*: every pass records `check_failed: Refusing to check non-public target`, persists no observation, creates no incident. `curl` succeeding from the worker host does not bypass this application-level gate. The fix is a small, explicitly trusted-target exception that preserves default-deny SSRF protection — not opening port 9898 publicly, not weakening validation.

**Tests actually run in this audit:** `npm run test:unit` → **221/221 pass** (`TEST VERIFIED`). Nothing else was executed (see §13).

---

## 2. Scope and audit limitations

**In scope:** the 13-step journey in the task brief (§3 of the brief): onboard → configure → persist → schedule → probe → classify → single incident → dashboard → diagnosis → approved remediation → independent verification → resolution → honest UI.

**Out of scope:** full-app redesign, dependency upgrades, production deployment procedure beyond the worker unit file, secrets rotation.

**What was NOT done (per strict rules):**

- No edits to application code, config, migrations, env files, dependencies, deployment files, or existing docs. Pre-existing working-tree modifications were left untouched (see §18 / final status).
- No database reads or writes (remote Supabase state is therefore `NOT VERIFIED`).
- No HTTP calls to Podinfo (`/`, `/healthz`, `/status/500`, fault-injection, `/panic`, readiness) and no worker SSH/journal inspection from this machine.
- No secrets printed; env contents never inspected.
- No `npm install`, no lockfile change.
- `test:db` (needs Docker) and `test:e2e` (needs live Supabase + creates/deletes its own projects) were **not run**.
- Deployed worker build (`/opt/devops-safeguard/.worker-build/...`) was not compared byte-for-byte with this source: build-vs-source correspondence is `NOT VERIFIED`.
- Whether an `ANTHROPIC_API_KEY` is configured anywhere is unknown (never inspected) — AI fallback behaviour is judged from code paths, not from a live key check.

**Evidence standard used throughout:** `VERIFIED IN CODE` / `TEST VERIFIED` / `PARTIALLY IMPLEMENTED` / `MISSING` / `BLOCKED` / `NOT VERIFIED` (brief §5). Every major conclusion cites file + symbol + line range + what the code does + why it supports the conclusion.

---

## 3. Actual repository and deployed-worker context

### 3.1 Repository state at audit time

- Branch: `main`. Working tree already contained modifications unrelated to this audit (full list in §18); this task created only `FEATURE_STATUS_AUDIT.md` and the ignored `.test-build/` compile output (`git check-ignore` confirms `.test-build` is git-ignored via `.gitignore:46`).
- Stack (from `package.json:1-49`): Next.js 14.2.13, React 18.3.1, TypeScript 5.6.2, Supabase JS + SSR, no Kubernetes client, no AI SDK in dependencies (Anthropic is called via `fetch` in `lib/ai/providers/anthropic.ts`).
- Scripts (`package.json:6-23`): `verify` (tsc + lint), `test:unit` (tsc test project + `node --test .test-build/tests/unit/*.test.js`), `test:e2e` (integration dir), `worker:build` / `worker` / `worker:once`, `test:db` (PowerShell + bash runners over throwaway Postgres), `db:types` (codegen against the remote project — not run).
- Migrations present (`supabase/migrations/`, 7 files): `20260928000000_phase1_core.sql`, `20260929000000_profile_trigger.sql`, `20260930000000_project_telemetry_and_rls_fix.sql`, `20261001000000_incident_domain.sql`, `20261002000000_detection_and_verification.sql`, `20261003000000_project_onboarding.sql`, `20261004000000_automatic_monitoring.sql`.
- Tests present: 23 unit files under `tests/unit/`, 2 integration files under `tests/integration/` (`auto-monitoring.e2e.test.ts`, `monitor-claims.e2e.test.ts`), SQL RLS harness under `supabase/tests/` (`00_auth_stub.sql`, `01_rls_and_telemetry.sql`, `02_incident_domain_rls.sql`, `03_onboarding_rls.sql`, `04_automatic_monitoring.sql` + `run.ps1`/`run.sh`).

### 3.2 External environment facts (taken as given, not re-probed)

- Podinfo 6.15.0 on a separate K3s EC2 host; namespace `podinfo`, deployment `podinfo`; private IP `172.31.30.138`; service port `9898`; reachable via existing HTTP ingress on port 80.
- Worker host can `curl` `http://172.31.30.138/healthz` → 200 `{"status":"OK"}`, `/` → 200, `/status/500` → 500, `/readyz` → 200; direct `:9898` times out. Port 9898 must stay closed to `0.0.0.0/0`.
- Safeguard worker: separate EC2, systemd `devops-safeguard-worker.service`, entry `/opt/devops-safeguard/.worker-build/worker/monitor-worker.js`, Node 22, `active (running)`, passes completing; some existing records fail on unresolvable hosts (`performer-delete-belfast-knows.trycloudflare.com`, `podinfo.example.com`).
- Standalone Podinfo Test Console exists at `C:\Users\Vinayak Umesh Kundar\Desktop\podinfo-test-console\` (loopback UI + allowlisted proxy, separate DB). Not modified, not audited beyond noting its separation.

---

## 4. Current architecture and request flow

```
Onboarding wizard (components/onboarding/*)
  → validate (lib/onboarding/validation.ts) + normalize/join (lib/onboarding/health.ts)
  → createProjectFromOnboarding (app/projects/actions.ts:308-417)
  → project_configs.health JSONB + project_configs.monitoring_enabled (default true)

Manual path:   [Run HTTP check] (app/projects/[id]/health-actions.ts:58-167)
Automatic path: systemd → monitor-worker.js → runSchedulerTick (lib/monitoring/scheduler.ts:321-557)
  → discover (project_configs) → ensure service → claim (services row lock)
  → runConfiguredHttpCheckCore (lib/monitoring/external-check.ts:192-346)   ← ONE probe for both paths
      → buildHealthCheckUrl → resolvePublicHost (SSRF gate) → fetch GET → classify
        (lib/monitoring/http-check.ts:26-50) → insert service_health_checks (source='external')
      → runMonitorTick (lib/detection/monitor.ts:360-539)
        → readExternalFailureStreak → reconcileService (lib/detection/reconcile.ts:127-215, pure)
        → applyDecision (incidents / incident_events / incident_evidence / verification_runs)
        → services.status + projects.health/counters rollup

Dashboard: ProjectDashboardPage (app/projects/[id]/page.tsx:113-202)
  → loadProjectConfig + readAutomaticMonitoringState + services/incidents selects
  → MonitoringConfiguration / AutomaticMonitoringPanel / OperationalControls / incident list
Incident detail/report: loadIncidentBundle (lib/incidents/load.ts:92-178) — single truth for
  detail page, report page, JSON export.
Diagnosis (manual button): generateAnalysis (incidents/actions.ts:348-369)
  → generateIncidentAnalysis (lib/ai/analyze-incident.ts:60-271) → ai_analyses + proposed remediations
Remediation (manual approve + execute): approve/reject/executeRemediation (incidents/actions.ts:393-480)
  → applyRemediation (lib/remediation/engine.ts:82-262, demo-state only) → verification_runs (if restoresHealth)
```

Key architectural facts: exactly **one** probe implementation shared by manual and scheduled paths (`external-check.ts:1-23` header); scheduling truth lives in Postgres (`services.monitoring_next_check_at`, etc.); detection is observe→detect (simulation/demo writes observations, `reconcileService` decides); verification is detector-owned with 3 consecutive healthy checks required (`reconcile.ts:115-116`).

---

## 5. Dashboard and onboarding compatibility — `VERIFIED IN CODE` (YES)

### 5.1 Configuration UI exists with the required fields

- Route: `/projects/new` → `app/projects/new/page.tsx:19-62` (`NewProjectPage`) hosts `AddProjectWizard` (10-step state machine, `components/onboarding/AddProjectWizard.tsx:67-82`); nothing is created until Review → Start Monitoring.
- Health step: `components/onboarding/steps/StepDepsHealth.tsx:148-302` (`StepHealth`) exposes: `method` radiogroup `http/port/container` (`159-179`); `targetType` select (`184-203`); `targetUrl` input (`204-226`, placeholder `https://app.example.com`); `endpoint` input (`229-241`, placeholder `/`); `expectedStatus` select `200,201,202,204,301,302` (`242-255`); `intervalSec` / `timeoutSec` / `failureThreshold` numeric inputs (`272-298`); live checked-URL preview via `buildHealthCheckUrl()` (`151,257-259`). Non-HTTP methods show an honest "no probe" note (`261-269`).
- A dedicated Podinfo test service is creatable: method `http`, `targetUrl=http://172.31.30.138`, `endpoint=/`, `expectedStatus=200`, interval/timeout/threshold within bounds. No Podinfo-specific restriction exists in the wizard.

### 5.2 Validation, normalization, persistence are consistent

- Bounds (`lib/onboarding/validation.ts:18-31`): interval 10–3600s, timeout 1–120s, threshold 1–10, expected ∈ {200,201,202,204,301,302}. `validateHealth()` (`176-198`) and server-side `validateOnboardingPayload()` (`228-263`) enforce the same rules; numeric runtime readers reuse these bounds (`lib/monitoring/health-settings.ts:23-36`), so no second rule exists.
- URL model (`lib/onboarding/health.ts:27-81`): `normalizeHealthTarget` (http/https only, hostname required, credentials rejected, ≤200 chars); `normalizeHealthPath` (must start `/`, rejects scheme/space/`<>"`, collapses `//`); `buildHealthCheckUrl` joins via `URL`, never string concat. `http://172.31.30.138` + `/` **passes** this layer → `http://172.31.30.138/`.
- Canonical config (`lib/onboarding/configuration.ts:63-151`): `normalizeHealthState`, `resolveHealthCheck`, `canonicalSubmitSections`/`buildCanonicalConfiguration` — Review screen (`StepReviewComplete.tsx:10-149`), submit payload, and persisted row all derive from one source.
- Writer (`app/projects/actions.ts:308-417`, `createProjectFromOnboarding`): inserts `projects`, upserts `project_configs{...,health, monitoring_status left as default `pending`}` (`340-358`), upserts env names/presence only (`372-397`), links draft idempotently (`402-417`). Stored shape `StoredHealth{method,targetType,targetUrl,endpoint,expectedStatus,intervalSec,timeoutSec,failureThreshold}` (`lib/onboarding/stored-config.ts:34-43`, narrowed by `normalizeStoredHealth:125-140`).
- **All six settings are consumed by the worker** (`readIntervalSec/readTimeoutSec/readFailureThreshold/readExpectedStatus`, `health-settings.ts:49-79`; `hasRunnableHttpConfig`, `:91-94`), not merely displayed. Defaults on malformed values: 30s / 5s / 3 / 200 (`:33-36`).

### 5.3 Dashboard shows genuine persisted state

- `app/projects/[id]/page.tsx:140-202` reads `projects`, `services`, `incidents`, `loadProjectConfig()`, `readAutomaticMonitoringState()`; empty states render `Unknown/Not available`, never fabricated Healthy. Manual-check gating `canRunConfiguredCheck` (`418-421`) requires a runnable HTTP config.
- `components/projects/MonitoringConfiguration.tsx:188-213` + `AutomaticMonitoringPanel:64-176` render the stored config and worker-written `services.monitoring_*` + latest `source='external'` check; staleness is derived from due-time arithmetic, never a "worker running" claim.
- Incident detail/report/export share `loadIncidentBundle()` (`lib/incidents/load.ts:92-178`): incident + service + events + evidence + latest `ai_analyses` + remediations + verifications + last 12 health checks; lifecycle phase is derived for display only (`deriveLifecyclePhase`, `lib/incidents.ts:219-235`).
- Health/incident/remediation/verification are visually distinct (status badges, impact grid from `service_health_checks`, verification progress `checksPassed/checksRequired`, timeline from `incident_events`, AI panel from stored `ai_analyses` only).

**Verdict §6-Q1: YES.** Dashboard + onboarding are compatible with configuring and displaying a Podinfo test service. (Whether the worker will *fetch* the private target is a separate gate — §6.)

---

## 6. HTTP-check engine and private-target compatibility — `BLOCKED` (NO for 172.31.30.138)

### 6.1 Request execution (public targets) — `VERIFIED IN CODE`

`runConfiguredHttpCheckCore()` (`lib/monitoring/external-check.ts:192-346`): config load → `buildHealthCheckUrl` → expected-status/timeout read → `new URL` + credential rejection → `resolvePublicHost()` → `ensureMonitoredService()` (canonical `Application endpoint` / `http-endpoint`, `94-129`) → `fetch(url, {method GET, redirect manual, User-Agent devops-safeguard-check/1.0, AbortController timeout})` (`251-256`) → drain body via `arrayBuffer` but never store it (`259`) → `classifyHttpStatus` / `classifyNoResponse` → `buildExternalObservation` (`source:'external'`, `is_demo:false`, no body/headers/secrets, `http-check.ts:118-167`) → insert `service_health_checks` (idempotency via `observationId`, duplicate PK `23505` treated as success, `304-318`) → `markMonitoringActive` (only `pending→active`) → `runMonitorTick`. Config/blocked/invalid → `ok:false, observed:false`, **no row** ("a check that never ran is not evidence"). Real 4xx/5xx/timeout/network → `ok:true, observed:true` with genuine `warning`/`critical` row. Failed write → `ok:false`, never reported healthy. Manual (`health-actions.ts:58-167`) and scheduler (`scheduler.ts:433-439`) call this same core with different claim/user attribution — one probe, no drift.

Classification (`http-check.ts:26-50`): `== expected → healthy/0`; `≥500 → critical/1`; anything else (3xx/4xx/unexpected 2xx/unparseable) → `warning/0.5`; timeout/network-no-response → `critical/1`. Redirects are recorded, never followed. Timeouts enforced per-check.

### 6.2 The private-target gate — walked line by line

For `targetUrl=http://172.31.30.138`, `endpoint=/`:

1. `normalizeHealthTarget` (`lib/onboarding/health.ts:27-46`) → `{value:"http://172.31.30.138/", error:null}` (http allowed, hostname present, no credentials). **Passes.**
2. `normalizeHealthPath("/")` (`:48-62`) → `{value:"/", error:null}`. **Passes.**
3. `buildHealthCheckUrl` (`:64-81`) → `{url:"http://172.31.30.138/", error:null}`. Wizard validation passes identically.
4. `resolvePublicHost("172.31.30.138")` (`lib/monitoring/external-check.ts:60-75`):
   - `isBlockedHostname` (`http-check.ts:65-69`) → `false` (not `localhost`, no blocked suffix).
   - `lookup("172.31.30.138", {all:true})` → `[{address:"172.31.30.138"}]` (IP literal).
   - `isBlockedAddress` (`:99-105`) → IPv4 regex matches → `isPrivateIPv4` (`:71-87`): parts `[172,31,30,138]`, branch `:76` (`a==172 && 16<=b<=31`) → **`true`** (172.16/12).
   - Returns `"Refusing to check non-public target \"172.31.30.138\"."`.
5. Caller (`external-check.ts:235-236`) returns `{ok:false, observed:false, error:blocked}` — fetch never happens, no observation row, detector never runs for this tick. The scheduler records it as `check_failed` with a bounded configuration retry (`retryDelaySeconds("configuration",…)`, `scheduler.ts:148-159,470`); the manual button surfaces the same refusal.

**Therefore:** the exact proposed configuration is wizard-valid but worker-refused. `TEST VERIFIED` (unit suite, 221 pass) covers this family: `http-check.test.ts` asserts loopback/private blocking, and `http-probe-execution.test.ts` uses a real local HTTP server while asserting SSRF guards are not weakened. No live fetch was performed in this audit.

### 6.3 Secure design that preserves SSRF protection (proposal, not implemented)

Do not weaken `isBlockedAddress`, do not add a URL-credential bypass, do not open 9898 publicly. The minimal safe shape is an **explicit, operator-configured trusted-target exception evaluated inside `resolvePublicHost`**, default-deny:

- Option A (recommended): project-scoped opt-in column (e.g. `project_configs.monitoring_allow_private` boolean, default false, migration required) + UI confirmation ("this target is inside your VPC; only enable for infrastructure you operate") — `resolvePublicHost` (or its caller) consults it and, when set, skips only the RFC-1918/CGNAT branch while keeping hostname-suffix, credential, redirect, and body-handling guards. Audit-log the opt-in via `incident_events`/config history.
- Option B: host allowlist env (`MONITOR_ALLOWED_PRIVATE_HOSTS`, exact IP/DNS entries, worker-env only, never user-supplied) matched before the private-IP refusal.
- Either way: keep `redirect: manual`, keep body-never-stored, keep per-project isolation, and keep `:9898`-direct closed (use the existing `:80` ingress host). A private DNS name does **not** help today — resolution still yields a blocked private IP and is refused at the second gate (`external-check.ts:69-73`); it needs the same exception.

---

## 7. Scheduler and worker compatibility — `VERIFIED IN CODE` (logic YES; deployed-build correspondence `NOT VERIFIED`)

- Startup (`worker/monitor-worker.ts:111-171`): `--once/--project/--help`, env files `.env` then `.env.local` without overriding real env (systemd wins), `loadWorkerConfig` validation (fail-fast exit 1), service-role client, schema probe (`project_configs` select; missing Phase-2 migration → `worker.schema_unavailable` + exit 1 with push hint). Sequential loop with self-overlap guard, infra-failure backoff (`5s·2^n`, cap 60s), SIGTERM/SIGINT graceful claim release (`175-271`).
- Config (`lib/monitoring/worker-config.ts:76-213`): requires Supabase URL + service-role key (rejects `NEXT_PUBLIC_*` service-role leak), poll 2–3600 (default 10), concurrency 1–16 (default 4), batch 1–1000 (default 200), lease 30–3600s (default 120); secret-free logging.
- Discovery (`scheduler.ts:169-215`): `project_configs` where `monitoring_enabled=true` (+ optional project filter); runnable-HTTP check else `ineligible`; broken URL else `ineligible`. DB error → failed pass, never silent `0 eligible`.
- Due-ness (`:230-296`): canonical service auto-created on first pass (same helper as manual); due = `next_check_at` null/past AND lease null/expired; invalid timestamps fail open to due (never strand a service).
- Claims (`lib/monitoring/claims.ts:54-184`): atomic conditional `UPDATE services SET run/worker/lease … WHERE id AND (due) AND (lease free)`; manual claims ignore due-time but respect live leases; completion/retry are ownership-gated (`runId+workerId`); `observationId=runId` makes retried observation writes idempotent. Bounded concurrency lanes (`scheduler.ts:542-554`); one failing target cannot break the batch (per-project try/catch + `recordFailure` + bounded `retryDelaySeconds`).
- Logging/reporting: per-pass `worker.pass_completed{ok,eligible,due,checked,failed,skipped,ineligible,durationMs}`; per-check `scheduler.check_completed/check_failed/claim_lost`; dashboard staleness derived from `next_check_at` (`automatic-state.ts:78-172`).
- Manual vs automatic: same core; manual is RLS-scoped + revalidates paths, claims without due-gating, always `transient` retry pacing; worker is service-role, due-gated, splits `configuration` vs `transient` retry pacing.
- **Deployed-vs-source: `NOT VERIFIED`.** The unit file (`deploy/devops-safeguard-worker.service:29`) points at `/opt/devops-safeguard/.worker-build/worker/monitor-worker.js` with `Restart=on-failure`, strict hardening (`44-54`) — but no build hash, version banner, or remote log excerpt was inspected in this audit, so the running build cannot be proven identical to this source. The existing unresolvable-host failures in worker logs are consistent with the current `resolvePublicHost` behaviour, not with a stale build — but that is corroboration, not proof.

---

## 8. Detection and incident lifecycle — `VERIFIED IN CODE` (logic YES; hardening `PARTIALLY IMPLEMENTED`)

Pure core (`lib/detection/reconcile.ts:22-215`): `critical|warning` = unhealthy; only `healthy` advances verification; `critical→critical` / `warning→medium` severity; `failureGate{consecutiveFailures,threshold}` holds incident creation below threshold while still updating `serviceStatus` to the observed failure (honest badge); `DEFAULT_VERIFICATION_CHECKS=3` (`115-116`); deduplication by caller-supplied `activeIncident` (`record_ongoing`); verification `begin(1/3) → advance → confirm` on consecutive healthy, `reset` on any unhealthy during verification, hold on `recovering/unknown/maintenance`.

IO shell (`lib/detection/monitor.ts:360-539`): per service loads latest check + active incident (`neq resolved`, newest first) + running verification; writes a timestamped `source='probe'` self-copy when unhealthy-or-incident-active (so every reconcile step maps to a row); computes the gate from genuine `source='external', is_demo=false` history only (`readExternalFailureStreak`, immune to self-copies and demo/simulation rows); applies exactly one decision; persists `services.status` on change; rolls up worst-status to `projects{health,service_count,active_incident_count,last_checked_at}`.

Walked against the intended test (threshold 3, expected 200):

1. `/ → 200`: `healthy` observation → `none` → service/project healthy, count 0. ✓
2.–3. `/status/500 → 500` ×1–2: `critical` rows persisted, `below_threshold`, service shows `critical`, no incident. ✓
4. 3rd consecutive 500: `open_incident` (severity critical, title `<name> is failing health checks`) + `detected` event + `metric` evidence + deployment snapshot → exactly one `open` incident. ✓
5. Further 500s: `activeIncident` present → gate bypassed → `record_ongoing`, no second row. ✓ (single-active-incident is an app query, not a DB constraint — see caveat)
6.–8. Recovery 200 ×1/2/3: `begin_verification(running,1/3)` + `monitoring` → `advance(2/3)` → `confirm_recovery` (`verification passed`, `incident resolved`, `resolved` event, linked remediation marked `verified` if any). ✓
9. Flap mid-verification: `reset_verification` (`checks_passed=0`), incident stays open. ✓ Dashboard reflects each transition on next load/poll (`IncidentPoller` re-runs detection every 8s while active).

**Caveats (why hardening is P1, not P0):** no DB transaction across the tick; dedup is read-then-write (`activeIncidentFor` select → `incidents` insert) with no partial unique index (`WHERE status<>resolved` per service); verification counters are read-modify-write with no single-winner guard beyond the monitoring claim (which manual/demo paths bypass). Two concurrent ticks could double-open or double-begin. The monitoring claim + `observationId` idempotency contain the scheduled path, but the guarantee is operational, not schematic. Unit tests cover the pure rules (`reconcile.test.ts`, `reconcile-failure-threshold.test.ts`, `failure-streak.test.ts`) and integration tests cover the happy-path lifecycle against real DB+HTTP (`auto-monitoring.e2e.test.ts`, not run here) — `TEST VERIFIED` applies only to the unit suite (221 pass).

---

## 9. Database and persistence — `VERIFIED IN CODE`

Seven migrations (`supabase/migrations/`): Phase-1 core + profile trigger + telemetry/RLS fix; `20261001000000_incident_domain.sql` (services, incidents, incident_events, incident_evidence, ai_analyses, remediation_actions + `can_access_project`/`can_access_incident` SECURITY DEFINER helpers + per-table RLS + indexes); `20261002000000_detection_and_verification.sql` (`service_health_checks` with `status`/`source` CHECKs, `verification_runs` default `checks_required=3`, remediation `action_type` allowlist CHECK — no arbitrary-command value); `20261003000000_project_onboarding.sql` (`project_configs` PK `project_id` with `health` JSONB + `monitoring_status` CHECK, `project_env_vars` with secret `value`-null rule, owner-only drafts); `20261004000000_automatic_monitoring.sql` (`project_configs.monitoring_enabled` default true; `services.monitoring_last/next_check_at/last_status/last_error/run_id/lease_expires_at/worker_id` + due/lease partial indexes; deliberately no `consecutive_failures` column — streak is derived).

RLS shape: `services`/`service_health_checks`/`project_configs` via `can_access_project(project_id)`; `incidents` children via `can_access_incident(incident_id)`; worker bypasses RLS with the service-role key (by design, server-side only). Types (`lib/supabase/database.types.ts`) cover all tables/columns/helpers with no observed drift, except status/severity/source enums are typed `string` (DB CHECKs are the enforcer, runtime narrowers the second line). Repeated checks append `service_health_checks` rows reliably (idempotent retry via PK); incident/event/evidence/verification writes are sequential PostgREST statements, no multi-statement transaction (see §8 caveat). No mismatch found between schema, queries, and dashboard reads.

---

## 10. Podinfo endpoint compatibility (code-level, no live calls made)

| Endpoint | Category | Usable through Safeguard health check? | Notes |
|---|---|---|---|
| `GET /` | app response | YES — the correct sustained-failure signal | With fault injection enabled, `/ → 500` while probes stay 200 (per Podinfo docs). Configure endpoint `/` for the sustained test. |
| `GET /healthz` | liveness probe | YES as a target, but WRONG for failure demo | Stays 200 during fault injection; monitoring it would never detect app-level faults. Use for "probes stay green" cross-check. |
| `GET /readyz` | readiness probe | Measurable, different category | `POST /readyz/disable` → readyz 500 (LB signal), not an app-500. Tests readiness plumbing, not HTTP-500 detection. |
| `GET /status/500` | deterministic one-shot 500 | YES — and the right FIRST test | Always 500 with no state change. Proves classification → critical → threshold → incident mechanics. **Does not by itself create a sustained incident**: if the configured endpoint is `/status/500` every poll is 500 (sustained by construction — acceptable for the pipeline test); if it is `/` and only one manual `/status/500` is fetched, subsequent polls return 200 and the streak breaks. |
| `GET /delay/5` | latency/timeout | YES with timeout awareness | 200 after ~5s; with default timeout 5s it straddles the abort boundary — expect flaky `critical/timeout` rows. Raise timeout or treat as a timeout-calibration test, not a 500 test. |
| `POST /fault_injection/enable\|disable`, `GET /fault_injection/status` | sustained app-fault control | INDIRECT — via the Test Console, not via Safeguard | Safeguard's probe is GET-only; it cannot toggle fault injection itself. Workflow: enable via console, let Safeguard poll `/`, verify `/healthz=200` alongside `/=500`, then disable + verify. |
| `GET /panic` | process crash | NO (out of scope for HTTP detection) | Kills the process (exit 255); K8s restarts it. Safeguard would observe connection failures (`critical/network`) during the gap — a connectivity-failure signal, not an app-500. Disruptive; test last, with `kubectl` restart confirmation. Never wire a health check at `/panic`. |
| `POST /readyz/disable\|enable` | readiness control | NO for detection | Same indirect pattern as fault injection; tests LB/readiness, not the 500 path. |
| `http://172.31.30.138:9898/...` | direct service port | Not reachable per given facts (timeout) | Use the `:80` ingress host. Do not open 9898 to `0.0.0.0/0`. |

Five failure categories stay distinct in code: one-shot 500 (single `critical` row) vs sustained app-500 (streak → incident) vs readiness failure (different endpoint, still classifiable but semantically different) vs crash (no-response `critical`) vs connectivity failure (DNS/timeout/refused → `critical`). The classifier maps all of them to `critical` honestly; the *streak + endpoint choice* is what makes the incident meaningful.

---

## 11. Diagnosis implementation status — `PARTIALLY IMPLEMENTED` (real but manual)

- Real pipeline exists: `generateAnalysis()` server action (`app/projects/[id]/incidents/actions.ts:348-369`) → `generateIncidentAnalysis()` (`lib/ai/analyze-incident.ts:60-271`) loads incident + service + deployment marker + evidence + events + last 10 health checks, calls the provider chain, persists `ai_analyses{provider,observation,interpretation,confidence,evidence_refs,raw,…}` (`173-189`) + `incident_events(kind=ai_analysis, actor=ai)` + proposes only allowlisted, not-already-proposed `remediation_actions(status=proposed, requires_approval=true)`; advances `open→investigating` at most, never regresses `monitoring/resolved`.
- Provider chain (`lib/ai/index.ts:25-64`): `AnthropicProvider` (endpoint `https://api.anthropic.com/v1/messages`, model `claude-sonnet-5`, 20s abort, `providers/anthropic.ts:22-113`) when a key exists, always falling back to `DeterministicProvider` (pure, verbatim citations, hedged correlation≠causation, confidence by signal count, `providers/deterministic.ts:1-155`). Schema gate (`lib/ai/schema.ts:58-132`) rejects off-allowlist `actionType`. Safe on provider outage by construction (warn + fall through; deterministic never throws).
- Visible in dashboard: `AiAnalysisPanel` reads stored `ai_analyses` only (detail page + report `AiSection`); placeholders are distinguishable from stored rows.
- **Gap:** nothing invokes it automatically. Grep confirms zero callers in `lib/detection/*` and `worker/*`; the sole production caller is the `Generate/Re-run AI analysis` button (`components/incidents/IncidentActions.tsx:46-54`). An incident can sit undiagnosed until a human clicks. For the minimum demo this is acceptable if the runbook includes the click; automatic post-incident diagnosis is a P2 milestone, not a demo prerequisite.

---

## 12. Remediation and recovery-verification status — `PARTIALLY IMPLEMENTED` (demo-only execution; verification real)

- Policy: human approval mandatory — engine refuses non-`approved` rows (`lib/remediation/engine.ts:96-104`) with a server-action double-gate (`incidents/actions.ts:455-464`); approve/reject only move `proposed→approved/rejected` (`393-446`).
- Allowlist: exactly 3 values (`lib/remediation/actions.ts:15-62`): `RESTART_DEMO_SERVICE` (low), `RETRY_HEALTH_CHECK` (low), `ROLLBACK_DEMO_DEPLOYMENT` (medium); DB CHECK enforces the same set (`20261002000000:75-90`); `requireRemediationSpec` throws fail-closed (`:74-83`).
- Execution reality (`engine.ts:129-196`): `RESTART_DEMO_SERVICE` inserts a fake-healthy `service_health_checks{source:simulation}`; `ROLLBACK_DEMO_DEPLOYMENT` flips `projects.deployment_status→success` + same fake row; `RETRY_HEALTH_CHECK` re-records current status as `probe` with no state change and opens **no** verification run. **No `child_process`, no shell, no kubectl, no Kubernetes client anywhere** (grep-verified across `lib/`, `worker/`, `app/`; only onboarding manifest *parsers* mention Kubernetes). No per-action timeout/retry/rollback machinery; failure = `markFailed()` → `status=failed` + audit event.
- Audit: `remediation_applied` / `remediation_approved|rejected` / `verification` events with `actor=system|user|ai` throughout engine + AI + actions files.
- Verification is independent and real: `restoresHealth` actions set `remediation applied` + incident `monitoring` + `verification_runs{running, required=3}` (`198-232`); the detector (not the engine) must then observe 3 consecutive genuine healthy checks before `confirm_recovery` resolves. Applying a fix never resolves directly.
- Four concepts kept distinct: (1) K8s auto-restart — no code invokes it; systemd `Restart=on-failure` restarts only the Safeguard worker itself. (2) Detection — automatic. (3) Safeguard-initiated remediation — human-gated, demo-state only. (4) Independent verification — detector-owned. **Today the project monitors, tracks, diagnoses (on click), and verifies — it cannot safely remediate real Podinfo failures.**

---

## 13. Existing test coverage and audit test results

### 13.1 Existing coverage (not re-run except unit suite)

- Unit (`tests/unit/`, 23 files): onboarding validation/health/ports/commands/dependencies/provenance/presets/configuration/failures/analyze; `health-settings`, `http-check` (classification + SSRF blocking), `http-probe-execution` (real local `node:http` server → fetch → classify → observation seam; body never persisted; SSRF not weakened), `failure-streak` (genuine-external-only counting), `reconcile` + `reconcile-failure-threshold` (open/dedup/threshold/verification), `deterministic-provider` + `ai-schema` (hedging, citations, allowlist choke), `remediation-allowlist` (exactly 3, no arbitrary command), `scheduler-resilience` (broken DB → `ok:false`, never throws), `worker-config` (required keys, defaults, secret redaction), `dotenv`, `analysis-discovery` (mocked GitHub).
- Integration (`tests/integration/`, require live Supabase + `E2E_*` keys, **not run**): `auto-monitoring.e2e.test.ts` (real DB + real HTTP: discovery, interval honoring, claims, threshold→1 incident, dedup, 3-healthy→resolved, SSRF records nothing, disabled skipped, single-winner concurrency, lease recovery, idempotent retry); `monitor-claims.e2e.test.ts` (claim contract).
- SQL (`supabase/tests/`, require Docker, **not run**): RLS/tenant isolation, allowlist rejects `EXECUTE_ARBITRARY_COMMAND`, scheduling columns/indexes, claim single-winner — via throwaway `postgres:17-alpine`.
- Gap: no browser/E2E asserting dashboard-against-persisted-rows; no test for a trusted-private-target exception (doesn't exist yet); concurrency-duplicate tests exist at e2e level only.

### 13.2 Audit test results (actually executed)

| Test | Result |
|---|---|
| `npm run test:unit` (`tsc -p tsconfig.test.json && node --test .test-build/tests/unit/*.test.js`) | **PASS — 221/221, 0 fail** (`TEST VERIFIED`). Includes SSRF-blocking, classification, streak, reconcile/threshold, scheduler-resilience, worker-config, allowlist, deterministic-provider suites. |
| `git check-ignore .test-build/...` | Confirms compile output is git-ignored (no repo pollution). |
| `test:db` / `test:e2e` | **Not run** (Docker / live-Supabase requirements; would exceed read-only audit bounds). |
| Live Podinfo / worker / DB probes | **Not run** (explicitly forbidden by the brief). |

---

## 14. Compatibility verdict table

| # | Question | Verdict | Evidence-based explanation |
|---|---|---|---|
| 1 | Dashboard compatible with configuring + displaying a Podinfo test service? | **YES** | Wizard fields + validation + canonical persistence + DB-driven dashboard all `VERIFIED IN CODE` (§5). |
| 2 | Worker can reach the Podinfo private ingress with existing HTTP-check code? | **NO** | `resolvePublicHost` refuses `172.31.30.138` before any fetch (`external-check.ts:60-75` + `http-check.ts:71-87`); every pass would be `check_failed`, zero observations. |
| 3 | URL validation allows the private target, and under what conditions? | **PARTIALLY** | Wizard/normalizer **allow** it; the worker safety gate **denies** all private IPs unconditionally — no per-project or env exception exists. Needs the §6.3 trusted-target design. |
| 4 | Scheduled monitoring makes real HTTP requests + persists outcomes? | **YES (code) / NO (this target)** | Mechanism is real and shared with manual checks; for this private IP it is `BLOCKED` at the gate, so nothing is fetched or persisted. |
| 5 | Repeated HTTP 500 → one incident? | **PARTIALLY** | Threshold gating + `record_ongoing` dedup are `VERIFIED IN CODE`, but single-active-incident and verification counters lack DB-level guards (race window). Works in the normal case; harden before load. |
| 6 | Dashboard displays that actual incident? | **YES** | `loadIncidentBundle` + detail/report/export read persisted rows; no mock status (`VERIFIED IN CODE`). |
| 7 | System independently verifies recovery + resolves? | **YES** | `begin→advance→confirm` over 3 consecutive genuine healthy checks, detector-owned (`VERIFIED IN CODE`). |
| 8 | Real diagnosis executes + persists? | **PARTIALLY** | Real, evidence-based, persisted, visible — but **manual-button only**, never automatic. Include the click in the demo runbook. |
| 9 | Real remediation executes, or placeholder/partial? | **PARTIALLY** | Executes, but **demo/simulated state only**, human-gated, no K8s/shell. Cannot recover real Podinfo; do not demo it as Podinfo healing. |
| 10 | Full desired demo works today without code changes? | **NO** | Blocked at Q2/Q3 for the stated private target. With an already-public target the monitor→incident→verify→resolve path works, but diagnosis needs a click and remediation stays demo-only. |
| 11 | Smallest safe change? | — | **Trusted-target exception (P0-1, §15):** explicit operator opt-in (project column or worker-env allowlist) consulted inside `resolvePublicHost`, default-deny preserved, plus migration + unit/integration tests + runbook note. No SG change, no 9898 exposure, no validation weakening. |

---

## 15. Prioritized implementation gaps

| Pri | Feature / defect | Status | Evidence | Files / functions | Required change | Deps | Acceptance criteria | Regression risks | Migration? | Deploy/env? |
|---|---|---|---|---|---|---|---|---|---|---|
| P0 | Private-target refusal blocks the entire demo | `BLOCKED` | `external-check.ts:60-75` + `http-check.ts:71-87`; wizard passes, worker refuses; worker logs' unresolvable-host failures corroborate gate behaviour | `lib/monitoring/external-check.ts:resolvePublicHost`; `lib/onboarding/health.ts`; `lib/monitoring/health-settings.ts`; `components/onboarding/steps/StepDepsHealth.tsx`; `app/projects/actions.ts` | Add explicit trusted-target opt-in (project boolean or `MONITOR_ALLOWED_PRIVATE_HOSTS` env), consulted at the refusal branch only; surface opt-in in wizard Review + dashboard; unit tests (private allowed iff trusted; everything else still refused) + e2e (real private-range target via local server or TEST-NET with flag on/off) | Decision: project-scoped vs env-scoped (recommend project-scoped, default false) | `http://172.31.30.138` + `/` with opt-in → real `external` observations; without opt-in → same refusal as today; all existing SSRF unit tests still pass | Medium: touching the SSRF boundary. Mitigate with default-deny, exact-host matching, no CIDR wildcards beyond explicit entries, and review of every `resolvePublicHost` caller | YES (boolean column, default false) | YES (worker env or config reread; no SG change) |
| P0 | Deployed worker build correspondence unproven | `NOT VERIFIED` | `deploy/devops-safeguard-worker.service:29` pins a build path; no hash/banner checked in this audit | `worker/monitor-worker.ts` (add startup log line); deploy runbook | Emit `build={git sha + build time}` in `worker.starting` log + document `git pull && npm ci && npm run worker:build && verify && systemctl restart` as the only deploy path | SSH access to worker host (outside this repo task) | `journalctl` shows build sha == repo HEAD at deploy time before the demo | Low | NO | YES (procedure only) |
| P1 | Detection dedup/verification races (no DB guards) | `PARTIALLY IMPLEMENTED` | `monitor.ts:191-357` sequential statements; no `BEGIN/COMMIT`, no partial unique index, read-modify-write counters (§8) | `lib/detection/monitor.ts:applyDecision/runMonitorTick`; migrations `20261001000000/20261002000000` | Add partial unique index `incidents(service_id) WHERE status<>resolved` (or project+service) + single-`running`-verification guard; handle conflict as dedup; add concurrent-tick test | P0 (rebase on same schema) | Two concurrent ticks → still one active incident, one running verification; existing lifecycle tests green | Medium: constraint violations on legacy duplicates — backfill/cleanup plan needed | YES | YES (db push + worker restart) |
| P1 | Diagnosis is manual-only; demo needs it in the runbook | `PARTIALLY IMPLEMENTED` | Sole caller is the button (`IncidentActions.tsx:46-54` → `incidents/actions.ts:348-369`); zero callers in detection/worker (grep-verified) | `app/projects/[id]/incidents/actions.ts:348-369`; `components/incidents/IncidentActions.tsx` | Short term: document the click + expected `ai_analyses` row in the demo plan (no code). Follow-up milestone: opt-in auto-diagnosis once per incident (guarded by `ai_analyses` existence check), never blocking detection | P0 (incident must exist first) | Demo shows stored analysis + proposed (allowlisted) remediations; provider outage still yields deterministic fallback | Low | NO | MAYBE (`ANTHROPIC_API_KEY` presence unknown; deterministic path needs none) |
| P2 | No real Podinfo remediation (K8s) | `MISSING` (by design) | `engine.ts:1-18,129-196` demo-state only; zero K8s/kubectl/client deps repo-wide | `lib/remediation/*`; `deploy/*`; future privileged remediator | Explicitly out of demo scope. If ever wanted: separate RBAC-scoped executor (e.g. SSM/k8s rollout restart of `podinfo` deployment), approval + audit + timeout + verification linkage. Do not bolt onto the monitoring worker's credentials | P0+P1 + cluster RBAC design | N/A for this demo | High if attempted — keep out of the minimum path | TBD | YES (new credentials, new deploy) |
| P2 | Stale-doc risk: state files vs code | Suppl. context only | `PROJECT_CURRENT_STATE.md` Q9–Q11 predate Phase 2 (noted as superseded in-file); architecture docs describe vision beyond code | `Docs/*`, `PROJECT_*.md` | Add one-line pointer in the demo runbook to this audit as the current code truth; do not rewrite docs in this task | None | Next engineer starts from §4/§18 here | None | NO | NO |
| P3 | IPv6/edge SSRF coverage gaps | `PARTIALLY IMPLEMENTED` | `isPrivateIPv6` (`http-check.ts:89-96`) misses `::ffff:`-mapped IPv4, `fec0::/10`, docs ranges; `isBlockedAddress` treats unparseable as blocked (safe default) | `lib/monitoring/http-check.ts:89-105` | Extend + unit-test mapped/edge forms when touching P0; keep fail-closed default | P0 | New unit cases pass; no behaviour change for clear public/private literals | Low | NO | NO |

---

## 16. Recommended minimum end-to-end demo plan (no remediation; diagnosis = one click)

Preconditions: P0-1 shipped + `supabase db push`; worker rebuilt, restarted, build sha confirmed in logs; SG unchanged (ingress :80 only); Test Console tunnel up on the laptop (console-only).

1. **Onboard:** `/projects/new` → method `http`, target `http://172.31.30.138`, endpoint `/`, expected `200`, interval `30`, timeout `10` (headroom over app latency), threshold `3`. Enable the new trusted-target opt-in for this project. Finish wizard; assert `project_configs.health` round-trips and `monitoring_status=pending`.
2. **Healthy baseline:** run one worker pass (or wait one interval). Assert one `service_health_checks{source:external, is_demo:false, status:healthy, metadata.status_code:200}`; `services` row `Application endpoint`; `monitoring_status → active`; dashboard Healthy.
3. **Deterministic 500 (pipeline proof):** change endpoint to `/status/500` (or onboard a second project pointing there). Wait `interval × threshold`. Assert N consecutive `critical` rows, still no incident before the Nth, then exactly one `open`/`critical` incident, no duplicates on further polls. Dashboard shows the incident.
4. **Sustained app failure:** via the Test Console (brief §2), `fault-enable` → assert console `GET / =500` while `/healthz=200`. Point Safeguard endpoint back to `/`. Repeat the threshold wait; assert one incident and `fault-status=enabled` cross-check. Then console `Reset all + verify` (fault disabled, probes 200).
5. **Diagnosis click:** open the incident → `Generate AI analysis` → assert one `ai_analyses` row + `ai_analysis` event + (optionally) `proposed` allowlisted remediation. Do **not** execute any remediation against Podinfo.
6. **Recovery:** with fault disabled and endpoint `/`, wait 3 consecutive healthy polls. Assert `open→monitoring→resolved`, `verification_runs` ends `passed`, service Healthy, counters cleared. One or two healthy polls must **not** resolve.
7. **Report:** open incident report + JSON export; confirm evidence lists the real status codes/latencies, not synthetic rows.

Rollback at any step: disable project monitoring (`project_configs.monitoring_enabled=false`) or stop the worker; claims expire via lease; no remediation to roll back.

---

## 17. Exact acceptance criteria for declaring the feature complete (minimum path)

- [ ] Project onboarded with `http://172.31.30.138` + `/` (+ trusted-target opt-in) persists verbatim and reads back identically on the dashboard.
- [ ] Worker pass writes one genuine `source='external', is_demo=false` row per interval with `metadata={checked_url, status_code, expected_status}` and no body/headers/secrets.
- [ ] `/status/500` sustained for `threshold` polls → exactly one active `critical` incident; further 500s add observations, never a second active incident.
- [ ] Dashboard incident list/detail show the real status codes, latencies, evidence, and verification progress (`x/3`).
- [ ] One button-triggered AI analysis persists exactly one `ai_analyses` row + event; provider outage still yields a valid deterministic analysis.
- [ ] Recovery (`/` → 200 ×3 consecutive) moves `open→monitoring→resolved` with `verification_runs.status=passed`; fewer than 3 does not resolve.
- [ ] `npm run test:unit` green; new trusted-target unit + e2e cases green; `test:db` green (needs Docker; run outside this audit).
- [ ] No remediation executed against real Podinfo; no SG/port change; no SSRF regression (existing blocking tests green).
- [ ] Report/export reflect persisted rows with no misleading success copy.

---

## 18. Files inspected and important evidence

Working-tree status at audit start/end (unchanged by this task except the new report + ignored build output):

```
M .gitignore
M app/globals.css
M app/projects/new/page.tsx
M components/onboarding/AddProjectWizard.tsx
M components/onboarding/StepFields.tsx
M components/onboarding/WizardStepper.tsx
M components/onboarding/steps/StepAnalysisDeploy.tsx
M components/onboarding/steps/StepBasicsRepo.tsx
M components/onboarding/steps/StepDepsHealth.tsx
M components/onboarding/steps/StepEnvRuntime.tsx
M components/onboarding/steps/StepReviewComplete.tsx
M components/projects/AddProjectDialog.tsx
M components/ui/Modal.tsx
?? components/onboarding/WizardShell.tsx
?? onboarding_project.md
?? vercel.json
(+ this report; .test-build/ ignored per .gitignore:46)
```

Primary evidence (all paths repo-relative):

- `lib/monitoring/http-check.ts:26-105,146-167` — classification + SSRF tables + observation contract.
- `lib/monitoring/external-check.ts:45-75,94-129,192-346,379-397` — gate, service identity, single probe, persistence, activation.
- `lib/monitoring/health-settings.ts:33-94`, `failure-streak.ts:36-119`, `claims.ts:54-184`, `worker-config.ts:76-213`, `automatic-state.ts:78-172`, `scheduler.ts:54-109,148-159,169-296,321-557`.
- `worker/monitor-worker.ts:65-78,111-171,175-271` — env, validation, schema probe, loop, shutdown.
- `app/projects/[id]/health-actions.ts:58-167` vs scheduler claim paths — one probe, two entries.
- `lib/detection/reconcile.ts:22-215` (pure rules, `DEFAULT_VERIFICATION_CHECKS=3`), `lib/detection/monitor.ts:33-53,69-142,191-357,360-539` (IO shell, probe self-copy, gate, rollup).
- `lib/incidents.ts:16-34,219-275`, `lib/incidents/load.ts:92-233` — statuses, phases, single bundle loader.
- `lib/onboarding/health.ts:27-102`, `validation.ts:18-31,176-263`, `types.ts:330-459`, `configuration.ts:63-151`, `stored-config.ts:34-43,125-184`; `components/onboarding/steps/StepDepsHealth.tsx:148-302`; `app/projects/actions.ts:308-417`.
- `app/projects/[id]/page.tsx:113-202`, `components/projects/MonitoringConfiguration.tsx:29-213`, `OperationalControls.tsx:29-131`, `ProjectHealth.tsx:15-89`; detail/report/export routes + `components/incidents/*` (RemediationControls, IncidentActions, IncidentPoller).
- `lib/ai/types.ts:11-80`, `index.ts:25-64`, `providers/anthropic.ts:22-113`, `providers/deterministic.ts:1-155`, `schema.ts:58-132`, `analyze-incident.ts:60-271`; caller `app/projects/[id]/incidents/actions.ts:348-369` + button `components/incidents/IncidentActions.tsx:46-54`.
- `lib/remediation/actions.ts:15-83`, `engine.ts:1-262`; gates in `incidents/actions.ts:392-480`.
- Migrations `supabase/migrations/20260928000000-20261004000000` (7 files; incident domain, detection/verification, onboarding, automatic monitoring) + `lib/supabase/database.types.ts`.
- `tests/unit/` (23 files) + `tests/integration/auto-monitoring.e2e.test.ts`, `monitor-claims.e2e.test.ts` + `supabase/tests/00-04` + runners; `package.json:6-23`; `deploy/devops-safeguard-worker.service:1-57`, `deploy/worker.env.example:1-37`; `PHASE_2_MANUAL_TESTING_AND_DEPLOYMENT.md` (supplementary runbook).

---

## 19. Unresolved questions and limitations

1. Deployed worker build vs this source — `NOT VERIFIED` (needs `journalctl` build-sha + redeploy confirmation from the EC2 host).
2. Remote Supabase schema/data state (migrations applied? a Podinfo project row already exists? existing incidents?) — `NOT VERIFIED` (no DB access in this audit).
3. `ANTHROPIC_API_KEY` presence/behaviour in production — unknown (never inspected); deterministic fallback covers the demo either way.
4. Podinfo ingress details beyond the given facts (host-based routing? TLS? auth?) — taken as given; `http://172.31.30.138` (+ opt-in) is the audited target form.
5. `podinfo.example.com` / `performer-delete-belfast-knows.trycloudflare.com` failures in worker logs — consistent with DNS-refusal handling (`does not resolve`, no row, bounded retry) but log excerpts were not inspected here.
6. Concurrent-tick duplicate behaviour under load — covered by e2e (not run) and flagged P1; needs the §15 guard + live verification.
7. Browser rendering of the new trusted-target opt-in — no such UI exists yet; design is proposed, not validated.
8. Whether `GET /delay/5` with timeout 5 vs 10 stays `healthy` or flaps `critical/timeout` in the real network — needs the calibration step in §16, not assumed.
9. Full demo timing (interval × threshold + 3-verify) against the real ingress latency profile — needs one live run after P0-1.
10. Any behaviour change between this audit and the next code change — this report is a snapshot of HEAD-at-audit-time plus the listed uncommitted working-tree state; re-verify §14 after P0-1 lands.
