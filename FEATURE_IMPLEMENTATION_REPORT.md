# Feature Implementation Report — Podinfo Monitoring & Incident Recovery Demo

**Date:** 2026-10-16 · **Baseline before edits:** `test:unit` 221/221, `typecheck` clean, `lint` clean ·
**After:** `test:unit` 242/242, `typecheck` clean, `lint` clean, `worker:build` clean.

Working tree was protected throughout: pre-existing uncommitted changes and
untracked files were preserved (no `reset`/`checkout`/`clean`), and every edit
below is additive except narrowly-scoped line-level refinements. The laptop
Test Console was not modified.

## 1. What was implemented (in source)

**P0 — Trusted private target, default-deny preserved**
- NEW `lib/monitoring/trusted-targets.ts` (pure, fully unit-tested): `parseTrustedPrivateHosts`
  (worker-env parsing, fail-closed on malformed entries, 16-entry cap, URLs/ports/CIDRs/
  wildcards/unsafe-hostnames/loopback/link-local/multicast/docs-ranges all rejected),
  `isAlwaysBlockedAddress` / `isBypassablePrivateAddress` (never-trustable vs excusable split,
  incl. `::ffff:`-mapped IPv4 handling), `isTrustedHost` (exact match), `evaluateTrustedAccess`
  (IP-literal allow; DNS names need hostname AND every resolved address covered; mixed/empty
  answers refused).
- `lib/monitoring/external-check.ts`: `resolvePublicHost(hostname, { trustedPrivateHosts, lookup })`
  — identical default behaviour when the list is absent/empty; trusted branch fails closed with a
  `Refusing… trusted-target policy` reason (keeps the scheduler's `configuration` retry class);
  injectable lookup for tests. `RunExternalCheckOptions.trustedPrivateHosts` threaded through
  `runConfiguredHttpCheckCore`. Incidental security fix: IPv4-mapped IPv6 loopback
  (`::ffff:127.0.0.1`) no longer reads as public (see `lib/monitoring/http-check.ts`).
- `lib/monitoring/worker-config.ts`: `trustedPrivateHosts: string[]` (malformed → startup exit 1),
  informational `buildSha` (`WORKER_BUILD_SHA`, optional), both in `describeWorkerConfig`
  (secret-free; addresses logged like the existing `supabaseUrl`).
- `lib/monitoring/scheduler.ts` (`SchedulerOptions.trustedPrivateHosts` → core call),
  `worker/monitor-worker.ts` (passes config, documents vars in `--help`),
  `app/projects/[id]/health-actions.ts` (manual checks parse the same server-side env and fail
  closed before claiming the service lease).
- `components/projects/MonitoringConfiguration.tsx`: static (no-DNS) amber note on private
  IP-literal targets — the worker fetches them only with an exact trust entry; entering the IP
  never trusts it.
- `deploy/worker.env.example`: documented `MONITOR_ALLOWED_PRIVATE_HOSTS` + `WORKER_BUILD_SHA`.
- No Podinfo hardcoding anywhere: the engine still serves any configured HTTP service.

**P0 — Scheduled monitoring / detection (verified, reused unchanged)**
- The shared probe, scheduler discovery/claims/retries, classification, persistence
  (`source='external'`, `is_demo=false`, real status/latency/time/metadata, no bodies/secrets),
  threshold gating, single-incident dedup, and 3-consecutive-healthy verification were traced
  end-to-end and needed no behavioural change for the demo baseline
  (target `http://172.31.30.138`, `/` or `/status/500`, expected 200, 30s/10s/threshold 3).

**P1 — Dedup/verification hardening**
- NEW `supabase/migrations/20261005000000_incident_dedup_guards.sql`: two partial unique indexes
  (`incidents_one_active_per_service`, `verification_runs_one_running_per_incident`) with
  backfill-first guidance in comments. NOT applied to any database by this task.
- `lib/detection/monitor.ts`: `begin_verification` reuses the race winner's run id for timeline
  metadata instead of recording null; documented 23505-as-dedup handling on both guarded
  inserts (behaviour unchanged: pass stays successful, existing incident stands).
- NEW `supabase/tests/05_dedup_guards.sql` + hooked into `run.ps1`/`run.sh` (ASCII-safe edit).

**P1 — Diagnosis / verification / remediation boundaries**
- Verified by inspection, no code change required: the diagnosis button persists real
  evidence-based `ai_analyses` with provider/fallback honesty; verification stays
  detector-owned (3 genuine healthy checks); remediation engine + UI already label
  demo/simulated state unmistakably (`engine.ts:129-159` result texts,
  `RemediationControls.tsx:160-161` confirmation copy). Automatic diagnosis and real
  Kubernetes remediation stay explicitly out of scope (see §5).

## 2. Verification matrix

| Claim | Status |
|---|---|
| Implemented in source (§1) | YES — files listed above |
| Covered by passing tests | YES — `test:unit` 242/242 (21 new trusted-target incl. SSRF regression, DNS/mixed-answer, default-deny, worker-config trust; all 221 pre-existing green), `typecheck` clean, `lint` clean, `worker:build` clean |
| Verified against an isolated real HTTP server | YES — pre-existing `http-probe-execution.test.ts` (local `node:http` → fetch → classify → observation seam) still passes unmodified |
| Verified against the actual deployed Podinfo | NOT YET — requires the AWS demo run (runbook §5–6); no live calls were made from this task |
| Verified through the real deployed worker | NOT YET — requires runbook §2–3 (migration push, worker deploy with trust var, build-sha log check) |
| New migration + DB guard tests executed | NOT YET — `test:db` blocked (Docker daemon down: `dockerDesktopLinuxEngine` pipe missing); files syntax-reviewed, harness wired for the next machine with Docker |

## 3. Commands executed and results

- `git status --short` (before/after — tree preserved, only intended new/modified files differ)
- `npm run test:unit` — baseline 221/221 → final **242/242, 0 fail**
- `npm run typecheck` — clean before and after
- `npm run lint` — no warnings/errors before and after
- `npm run worker:build` — clean (also proves the worker tsconfig accepts the new threading)
- `npm run test:db` — **could not run**: Docker client present (29.3.1) but daemon unreachable
- `npm run test:e2e` — **not run**: needs an isolated Supabase stack (`E2E_SUPABASE_URL`/`SECRET_KEY`); never pointed at production
- No Podinfo, worker-host, or Supabase-remote commands were run; no `.env` contents inspected.

## 4. Files changed / added

Modified: `lib/monitoring/http-check.ts` (mapped-IPv6 fix),
`lib/monitoring/external-check.ts` (trusted branch + options threading),
`lib/monitoring/worker-config.ts` (trust + build-sha config),
`lib/monitoring/scheduler.ts` (option threading),
`lib/detection/monitor.ts` (race-winner reuse + dedup comments),
`worker/monitor-worker.ts` (`--help` docs + config pass-through),
`app/projects/[id]/health-actions.ts` (manual trust mirroring, fail-closed pre-claim),
`components/projects/MonitoringConfiguration.tsx` (private-target eligibility note),
`deploy/worker.env.example` (new vars), `supabase/tests/run.ps1` + `run.sh` (new files in lists).
Added: `lib/monitoring/trusted-targets.ts`, `tests/unit/trusted-targets.test.ts`,
`supabase/migrations/20261005000000_incident_dedup_guards.sql`,
`supabase/tests/05_dedup_guards.sql`, `PODINFO_DEMO_RUNBOOK.md`, this report.
Untouched: Test Console, all onboarding wizard behaviour, AI/remediation engines,
existing migrations/docs (except the runners above), and every pre-existing
uncommitted change.

## 5. Remaining limitations (explicit)

1. Migration + DB guard tests await a Docker-capable machine (`test:db`) and a
   DBA-reviewed push (`supabase db push` after the runbook backfill SELECTs).
2. Live Podinfo + worker proof awaits the AWS steps below — claimed nowhere above.
3. DNS lookup-vs-connect window for trusted DNS *names* (mitigated, documented in
   runbook §9; the demo uses an IP literal, which has no window).
4. Detection ticks are still multi-statement (no full transaction); guards +
   handling close the duplicate hole, not every interleaving.
5. Diagnosis stays manual-button; Kubernetes remediation stays a future milestone
   requiring a separate RBAC-scoped executor — the demo proves restoration-based
   recovery, never simulated healing.

## 6. Exact next actions to demonstrate on AWS (your side)

1. `git diff --stat` review, then `supabase db push` only after the two
   read-only duplicate-check SELECTs (`PODINFO_DEMO_RUNBOOK.md` §2) return empty.
2. On the worker EC2: pull, `npm install`, `WORKER_BUILD_SHA=$(git rev-parse
   --short HEAD) npm run worker:build`, `npm run verify`, set
   `MONITOR_ALLOWED_PRIVATE_HOSTS=172.31.30.138` + `WORKER_BUILD_SHA` in
   `/etc/devops-safeguard/worker.env` (600), `systemctl restart`, confirm
   `worker.starting` shows the same sha + trusted host.
3. Redeploy the web app at the same revision (rebuild for `NEXT_PUBLIC_*`).
4. Onboard the Podinfo project (§4 values), run Mode A (`/status/500`), then
   Mode B (`/` + Test Console fault injection), the diagnosis click, recovery,
   and report/export — asserting the row-level expectations in runbook §5–6
   (90s ≈ 3×30s per transition; 1–2 healthy polls must NOT resolve).
5. Roll back per runbook §7 if anything diverges; file row evidence with any bug.
