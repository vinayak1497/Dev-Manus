# Phase 2 Completion Report — Automatic Monitoring (DevOps Safeguard)

**Date:** 2026-10-10
**Scope:** Phase 2 of DevOps Safeguard per the implementation directive.
**Source of truth:** the repository's current code. The Phase 1 report was
treated as historical evidence; every claim below was re-verified against the
actual implementation and the test runs in §F/§G.

---

## A. Result

**COMPLETE.**

After the steps in `PHASE_2_MANUAL_TESTING_AND_DEPLOYMENT.md`, a user onboards
a real deployed application, configures its health endpoint, and DevOps
Safeguard monitors it automatically — with the browser closed, the user logged
out, and no clicks. This was demonstrated with the real worker binary against
a real database over wall-clock time (§G).

One unrelated, pre-existing issue was found and fixed along the way: the
production server on `localhost:3000` was serving a build whose Supabase
credentials were baked against a local Docker stack, so every login failed
with "Incorrect email or password". It was rebuilt against the configured
remote project and restarted (§J.3).

---

## B. Architecture

```
Onboarding wizard (unchanged)
  └─ project_configs.health (8 fields) + monitoring_enabled (new, default true)
                        │
                        ▼
          ┌─ worker/monitor-worker.ts ─────────────────────┐
          │ plain Node.js process, no Next.js, no browser   │
          │ env validation → fail fast │ JSON logs, no keys │
          │ sequential passes │ SIGTERM/SIGINT → release    │
          │ own claims → exit                               │
          └───────────────┬────────────────────────────────┘
                          │ one pass =
                          ▼
          lib/monitoring/scheduler.ts — runSchedulerTick
            discover │ ensure │ claim │ check │ schedule
                          │         │       │
              project_  ensureMoni- │  runConfiguredHttpCheckCore
              configs   toredService│  (lib/monitoring/external-check.ts:
                        (shared     │   THE Phase 1 probe, de-Next.js'd)
                        w/ manual)  │
                                    ▼
                          lib/monitoring/claims.ts
                     atomic conditional UPDATE on services
                     (due-time + lease predicates, expires)
                                    ▼
                    service_health_checks (source='external')
                                    ▼
                    runMonitorTick (extended: reads failureThreshold,
                      derives the genuine-external streak, passes a
                      FailureGate for genuinely-monitored services)
                                    ▼
                    reconcileService (extended: below_threshold action;
                      every other rule byte-identical)
                                    ▼
              incidents / verification_runs / services.status
              (existing state machine, untouched)
                                    ▼
              services.monitoring_* (next_check_at, last_check_at,
                last_status, last_error, run_id, lease, worker_id)
                                    ▼
              Dashboard: MonitoringConfiguration + new
              AutomaticMonitoringPanel (lib/monitoring/automatic-state.ts)
```

Component names above are the actual file/function names. There is exactly one
probe (`runConfiguredHttpCheckCore`, also used by the manual "Run HTTP check"
action), exactly one detector (`runMonitorTick` → `reconcileService`), and
exactly one claim implementation (`claims.ts`, used by worker and manual
action alike). No second monitoring engine was created.

---

## C. Files changed

**Created**

| File | Purpose |
|---|---|
| `supabase/migrations/20261004000000_automatic_monitoring.sql` | Scheduling columns, claim columns, `monitoring_enabled`, due index |
| `supabase/tests/04_automatic_monitoring.sql` | SQL assertions for the migration (claim exclusivity, expiry recovery, due enforcement, CHECK, index, RLS intact) |
| `lib/monitoring/external-check.ts` | The Phase 1 probe extracted Next-free: SSRF preflight, fetch, classify, persist, tick |
| `lib/monitoring/scheduler.ts` | Unattended tick: discovery, due resolution, bounded concurrency, backoff |
| `lib/monitoring/claims.ts` | Shared atomic claim/completion/retry/release with ownership predicate (co-developed in-session; integrated here) |
| `lib/monitoring/failure-streak.ts` | Derived consecutive-genuine-failure streak (pure core + bounded reader) |
| `lib/monitoring/health-settings.ts` | Single runtime reading of interval/timeout/threshold/expected-status |
| `lib/monitoring/automatic-state.ts` | Dashboard view: last/next check, latest result, streak, honest staleness |
| `lib/monitoring/worker-config.ts` | Startup env validation (pure, tested) |
| `lib/monitoring/worker-log.ts` | Stdlib JSON logging with credential redaction |
| `lib/project-config-read.ts` | Client-injected config read shared by Next.js and the worker |
| `lib/supabase/service-role.ts` | Server-only service-role client factory |
| `worker/monitor-worker.ts` | Process entrypoint: env files, validation, loop, pass backoff, graceful shutdown |
| `tsconfig.worker.json` | CommonJS build to `.worker-build/` (no alias rewriting needed) |
| `deploy/devops-safeguard-worker.service` | systemd unit for the EC2 host |
| `deploy/worker.env.example` | Documented environment template (placeholders only) |
| `tests/unit/health-settings.test.ts` | 11 tests: bounds, defaults, eligibility |
| `tests/unit/failure-streak.test.ts` | 11 tests: threshold/reset/exclusion semantics |
| `tests/unit/reconcile-failure-threshold.test.ts` | 9 tests: gate behaviour + unchanged recovery |
| `tests/unit/worker-config.test.ts` | 10 tests: startup contract + log redaction + pacing |
| `tests/unit/scheduler-resilience.test.ts` | 2 tests: broken DB client → `ok:false`, never throws |
| `tests/integration/auto-monitoring.e2e.test.ts` | 14 end-to-end behaviours against real PostgREST/Postgres |
| `tests/integration/monitor-claims.e2e.test.ts` | 5 claim-contract behaviours against real row locks |
| `PHASE_2_MANUAL_TESTING_AND_DEPLOYMENT.md` | Operator guide (this report's §H) |

**Modified**

| File | Change |
|---|---|
| `app/projects/[id]/health-actions.ts` | Delegates to the shared core; manual path now claims through the same lease contract |
| `app/projects/[id]/page.tsx` | Reads automatic-monitoring state, passes it to the config card |
| `components/projects/MonitoringConfiguration.tsx` | New Automatic monitoring panel (reuses `Row`/`Badge`, existing tokens only) |
| `lib/detection/reconcile.ts` | Additive `failureGate` input + `below_threshold` action; all other rules untouched |
| `lib/detection/monitor.ts` | Reads threshold + genuine streak, passes the gate; `below_threshold` persists nothing |
| `lib/onboarding/validation.ts` | Health bounds exported as named constants (same values, same messages) |
| `lib/project-config.ts` | Delegates to the shared client-injected reader (same query, same narrowing) |
| `lib/supabase/database.types.ts` | New columns added to match the migration (pending `npm run db:types` regen) |
| `package.json` | `worker:build`, `worker`, `worker:once`, `test:e2e` scripts |
| `tsconfig.test.json` | Compiles `lib/monitoring`, `project-config-read`, `tests/integration` |
| `.gitignore` | Ignores `.worker-build/` |
| `supabase/tests/run.ps1`, `run.sh` | Run the new migration + assertions |

**Incidental (pre-existing, completed Phase 1 work, untouched):**
`lib/monitoring/http-check.ts` (`buildExternalObservation`),
`tests/unit/http-probe-execution.test.ts`, `PHASE_1_IMPLEMENTATION_DISCOVERY.md`.

---

## D. Technology decisions

- **Scheduler:** a small Node.js worker + Postgres-backed due times and
  expiring leases. No Redis/BullMQ/cron framework/`node-cron`/Vercel Cron —
  none is needed to check N endpoints on independent cadences, and each would
  add an operator to install, fund, or supervise. The poll loop (default 10s,
  ≤ smallest `intervalSec`) only *discovers*; `monitoring_next_check_at`
  *decides*, so a coarse poll can only delay a check, never run one early.
- **Worker process:** separate `node` process built by `tsc` to CommonJS, using
  only relative imports (tsc does not rewrite `@/`). No Next.js runtime, no
  HTTP surface, no browser dependency.
- **Supervision:** systemd on the EC2 host (`Restart=on-failure`, SIGTERM grace
  for claim release). The worker additionally never overlaps with itself.
- **Persistent scheduling state:** per-service `monitoring_next_check_at` /
  `monitoring_last_check_at`; per-run `monitoring_run_id` (doubles as the
  observation PK, making retried inserts no-ops); expiring
  `monitoring_lease_expires_at` + `monitoring_worker_id`. `projects.last_checked_at`
  was deliberately NOT used as the cursor (project-wide rollup, rewritten by
  manual ticks).
- **Database access:** a server-only service-role client (the worker has no
  user session, so RLS-by-`auth.uid()` would silently return zero rows — the
  worst failure mode for a monitor). The key is never bundled, logged, or
  returned; a `NEXT_PUBLIC_*` service key is a startup error. No RLS policy was
  weakened; tenant isolation for the app is unchanged.
- **Failure counting:** derived from persisted `source='external'` AND
  `is_demo=false` rows — never a stored counter, so it cannot drift, cannot
  double-count a retried write, and survives restarts for free. Demo,
  synthetic, simulation and `monitor probe` rows are excluded by construction.
- **Concurrency:** bounded lanes (default 4, max 16); one conditional UPDATE
  claims a check (proven exclusive against real PostgREST); completion and
  retry writes are conditional on still owning the claim.

## E. Database changes

- **Migration:** `supabase/migrations/20261004000000_automatic_monitoring.sql`
  (additive only: 7 columns on `services`, 1 on `project_configs`, 2 partial
  indexes, comments; no policy or column altered).
- **Application status:** applied to the **local** throwaway verification stack
  and proven there. It has **not** been applied to the remote project — run
  `supabase db push` from a linked checkout (guide §9). No production data is
  touched by the migration (new columns default empty/true).
- `lib/supabase/database.types.ts` was updated by hand to match the migration
  exactly (the generator needs CLI auth unavailable here); re-running
  `npm run db:types` after the push must produce no diff — verify this.

## F. Tests

| Suite | Command | Result |
|---|---|---|
| Typecheck + lint | `npm run verify` | ✅ clean |
| Unit | `npm run test:unit` | ✅ **221/221** (178 pre-existing, 43 new, stdlib only) |
| DB migrations + RLS + claims | `supabase/tests/run.ps1` (Docker Postgres) | ✅ **PASSED** incl. new `04_automatic_monitoring.sql` |
| End-to-end (scheduler) | `npm run test:e2e` vs local Supabase | ✅ **14/14** |
| End-to-end (claim contract) | same run | ✅ **5/5** |
| Real worker, wall clock | `worker-demo` harness (temp, §G) | ✅ full cycle observed |
| Browser (dashboard + manual check) | playwright vs `next dev` + local Supabase | ✅ panel renders real data; manual check records a real observation |

New unit coverage: runtime bounds/defaults/eligibility (11), streak semantics
(11), reconcile gate + unchanged recovery (9), startup validation + log
redaction + retry pacing (10), scheduler DB-failure behaviour (2).
New DB coverage: claim exclusivity, lease-expiry recovery, due enforcement,
status CHECK, due index, RLS intact.
New E2E coverage (§18 A–G): selection, interval enforcement, restart
persistence, threshold 1/3, healthy reset, synthetic exclusion, no double
count, claim exclusivity + recovery, no duplicate incidents, write idempotency,
verification + resolution, SSRF refusal without batch harm, disabled projektu
never selected, DB-down behaviour.

## G. Automatic end-to-end evidence

Real worker binary (`demo-worker`, poll 5s) against the local Supabase stack,
project `intervalSec=10`, `failureThreshold=3`, target `https://example.com/`
(public, real HTTPS, no stubs):

| Wall time (UTC) | Event | Evidence |
|---|---|---|
| 10:51:56 | first automatic check, nobody watching | `external/healthy`, `HTTP 200 in 325ms`, `checked_url=https://example.com/` |
| 10:52:06, 10:52:16 | cadence | observations exactly 10s apart; in-between passes `skipped` |
| 10:52:27, 10:52:37, 10:52:47 | target switched to a real 404 path | 3 consecutive `external/warning` recorded; **no incident** after 1st/2nd; service row shows real `warning` |
| 10:52:57 | 3rd consecutive failure | **exactly one** incident (`medium`, "Application endpoint is degraded") |
| 10:53:07 … 10:53:28 | target restored | `begin_verification (1/3)` → advances → `confirm_recovery` |
| 10:53:38+ | resolved | incident `resolved`, service `healthy`, verification run `passed (3/3)` |
| end | SIGTERM | process ends; claims released (lease-expiry covers the Windows case) |

Totals: 19 observations (12 external + 7 `monitor probe` self-copies —
pre-existing Phase 1 behaviour, one per tick while unhealthy), 1 incident
opened, 0 duplicates, 0 fabricated rows. Full worker JSON log retained in the
session record.

## H. Deployment instructions

See **`PHASE_2_MANUAL_TESTING_AND_DEPLOYMENT.md`** (§1–§12). Remaining manual
steps before EC2 deployment:

1. `supabase db push` (applies the Phase 2 migration to the remote project).
2. `npm run db:types` and confirm zero diff on `database.types.ts`.
3. Provision `/etc/devops-safeguard/worker.env` (two required values) with
   `chmod 600`.
4. Deploy code, `npm install && npm run worker:build && npm run verify`.
5. Install `deploy/devops-safeguard-worker.service`, `daemon-reload`,
   `enable --now`, then follow the guide's §6–§7 verification with a
   non-production target first.

## I. Security review

- **SSRF:** unchanged Phase 1 guards run on every automatic check (blocked
  hostnames pre-DNS, all-resolved-addresses public, credentials rejected,
  `redirect:"manual"`, fixed UA, verified TLS, bodies discarded). Proven live:
  a `localhost` target is refused with `Refusing to check internal target`,
  records no observation, and does not stop the batch (E2E §10/§12).
- **Secrets:** service-role key is server-only (`lib/supabase/service-role.ts`
  throws in a browser, rejects `NEXT_PUBLIC_*` keys at startup); the logger
  redacts credential-shaped fields recursively (unit-proven, after fixing two
  real redaction gaps found by the tests); `project_env_vars.value` is still
  never selected; error messages carry no secrets.
- **Access control:** worker discovers from `project_configs` (enabled flag),
  never from user-supplied ids. Manual action keeps `authed()` +
  `canSeeProject` (RLS). No RLS policy changed. No unauthenticated trigger
  endpoint was added (single-project runs use operator-only CLI flags).
- **Concurrency:** single-winner claims, expiring leases, ownership-checked
  completion, idempotent observation ids, no unbounded fan-out.
- **Unresolved (deferred, Phase 3):** DNS-rebinding TOCTOU, no port allowlist,
  plaintext-`http` allowed, no probe rate limiting — all pre-existing Phase 1
  findings, none introduced or widened here.

## J. Remaining blockers

1. **Remote migration not applied** (missing infrastructure step, §H.1). The
   worker refuses to start against a database without it (`schema_unavailable`,
   exit 1) rather than silently monitoring nothing.
2. **Service-role key for the remote project** must be provisioned into
   `worker.env` (§H). It is intentionally absent from this repo.
3. **Login incident (fixed, verifying):** the `localhost:3000` production
   server was serving a build baked against the local Docker Supabase
   (`sb_publishable_ACJWlzQHlZjBrEguHvfOxg…` + `http://127.0.0.1:55421`), so
   the real account could not exist there. Rebuilt against
   `https://afbuzhsnnczfawuwnglr.supabase.co` and restarted. **Please retry
   your login** — if it still fails, the account itself is missing/wrong on
   the remote project (GoTrue distinguishes nothing further), and the fix is
   registering on `/register`, not code.
4. **Not executed:** hosted-EC2 systemd run (no EC2 access from here);
   two-clicks-fast manual contention in a browser (contract proven in E2E §4,
   browser variant left as a manual check); full third-party-free 5xx over the
   public internet (classification is unit-proven; E2E used real 4xx + stubbed
   500).
5. **Deferred Phase 3:** notifications (no implementation exists in the repo —
   only env names — so nothing was wired, per the directive), heartbeat table,
   DNS/rebinding + port policy, authenticated endpoints, `port`/`container`
   probes.

## K. Phase 2 completion score

Automatic execution 5/5 · Scheduling 5/5 · Real monitoring 5/5 · Incident
threshold 5/5 · Recovery 4/4 · Operations 4/5 (systemd unit shipped, EC2 run
not executed here) · Quality 5/6 (browser contention variant manual-only).
**Total: 33/35 honest passes; 2 items require the operator's environment.**

## L. Final verdict

**YES** — if you follow `PHASE_2_MANUAL_TESTING_AND_DEPLOYMENT.md` and supply
the two required values (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`), you can leave your browser closed and DevOps
Safeguard will automatically monitor a real deployed application: discover it,
check it on its configured interval, record every real result, open exactly
one incident at the configured consecutive-failure threshold, verify recovery
with the existing state machine, resolve it, survive restarts without losing
or duplicating work, and show all of it — honestly, including when checks have
stopped — on the dashboard.
