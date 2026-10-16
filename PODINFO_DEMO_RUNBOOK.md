# Podinfo Monitoring Demo — Deployment & Demonstration Runbook

Proves: healthy Podinfo → real HTTP failure → one Safeguard incident → real
dashboard update → (manual) diagnosis → healthy recovery → verified resolution.

Source changes required: the trusted-target exception (`MONITOR_ALLOWED_PRIVATE_HOSTS`)
plus the dedup-guard migration. Nothing here opens port 9898, weakens validation,
or touches the laptop SSH tunnel (console-only, never used by the worker).

## 0. Target configuration (the demo baseline)

| Field | Value |
|---|---|
| Target URL | `http://172.31.30.138` (VPC ingress :80, same `vpc-04f6ebfaa9e476195`) |
| Endpoint Mode A | `/status/500` (deterministic 500, expected `200`) |
| Endpoint Mode B | `/` with fault injection via the separate Test Console |
| Expected status | `200` |
| Interval | `30` seconds |
| Timeout | `10` seconds |
| Failure threshold | `3` |
| Worker trust | `MONITOR_ALLOWED_PRIVATE_HOSTS=172.31.30.138` on the worker host only |

Timing math: first incident ≈ interval × threshold (30s × 3 ≈ 90s after the
fault starts); resolution needs 3 consecutive healthy polls (≈ 90s after recovery).

## 1. Build and verify locally (laptop)

From the repository root, with the working tree as deployed (do not discard
unrelated uncommitted work — this feature is additive):

```powershell
git status --short
npm run test:unit      # expect 242/242 (221 baseline + 21 trusted-target)
npm run typecheck      # expect clean
npm run lint           # expect no warnings or errors
npm run worker:build   # expect clean; output in ignored .worker-build/
```

`npm run test:db` (throwaway Postgres via Docker) covers the new migration
and `05_dedup_guards.sql` when a Docker daemon is available; it needs no
credentials and never touches real Supabase. `npm run test:e2e` needs an
isolated Supabase stack (`E2E_SUPABASE_URL` + `E2E_SUPABASE_SECRET_KEY` from a
local `supabase start`) and must never point at production.

Record the source revision for deploy correspondence:

```powershell
git rev-parse --short HEAD   # -> e.g. abc123; used as WORKER_BUILD_SHA below
```

## 2. Database first: backfill check, then push (NOT automatic)

The dedup-guard migration fails closed if duplicate active incidents or
duplicate running verifications already exist. Run these read-only checks in
the Supabase SQL editor first:

```sql
select service_id, count(*)
  from public.incidents
 where status <> 'resolved' and service_id is not null
 group by service_id having count(*) > 1;

select incident_id, count(*)
  from public.verification_runs
 where status = 'running'
 group by incident_id having count(*) > 1;
```

- No rows: apply the migration: `supabase db push` (from any machine with
  the CLI linked). This adds only two partial unique indexes; no tables,
  columns, or RLS change, so web and worker builds keep working during rollout.
- Rows returned: keep the newest row per set (by `detected_at` / `started_at`),
  move older active incidents to `resolved` with a `note` event
  ("closed as duplicate of <kept id>"), and older running verifications to
  `cancelled`. Then push.

## 3. Worker deploy (EC2, systemd host)

```bash
cd /opt/devops-safeguard
git pull
npm install
WORKER_BUILD_SHA=<sha-from-step-1> npm run worker:build
npm run verify
```

Edit `/etc/devops-safeguard/worker.env` (root, `chmod 600`):

```ini
MONITOR_ALLOWED_PRIVATE_HOSTS=172.31.30.138
WORKER_BUILD_SHA=<same-sha>
```

All other variables stay as documented in `deploy/worker.env.example`.
Restart and confirm:

```bash
sudo systemctl restart devops-safeguard-worker
sudo journalctl -u devops-safeguard-worker --since "5 min ago" | grep worker.starting
```

The `worker.starting` line must show the same `buildSha` recorded in step 1
and `trustedPrivateHosts: ["172.31.30.138"]`. A malformed allowlist fails
startup with `MONITOR_ALLOWED_PRIVATE_HOSTS: ...` and exit 1 — fix the file,
never the code.

Web app deploy (wherever Next.js runs): rebuild (`NEXT_PUBLIC_*` bakes at
build time) and restart so the dashboard serves the same revision, including
the private-target eligibility note.

## 4. Configure the Podinfo project (dashboard)

`/projects/new`: method HTTP, target `http://172.31.30.138`, endpoint `/`
(Mode B) or `/status/500` (Mode A), expected `200`, interval `30`, timeout
`10`, failures-to-alert `3`. The Monitoring configuration card shows the
stored target plus, for private literals, an amber note: the worker fetches
it only when that exact host is trusted — entering the IP never trusts it.

## 5. Mode A — deterministic failure (run first)

1. Endpoint `/status/500`. Wait ~90s.
2. Supabase `service_health_checks` (newest first): consecutive
   `status='critical'`, `source='external'`, `is_demo=false`,
   `metadata.status_code=500`, real `latency_ms`/`checked_at`.
3. No incident after the 1st–2nd failure (service row honestly shows
   `critical`); exactly one `critical` incident after the 3rd; further 500s
   add observations, never a second active incident.
4. Dashboard: incident list + detail show real codes/latencies/evidence;
   Automatic panel shows `N of 3 to alert` then `1 open`.
5. Open the incident → `Generate AI analysis` → one `ai_analyses` row
   (provider name or deterministic fallback, honestly labelled) + allowlisted
   `proposed` remediation. Do NOT execute anything against Podinfo.
6. Restore endpoint `/`, wait ~90s of healthy polls: `open → monitoring →
   resolved`, `verification_runs` ends `passed`. One or two healthy polls
   must NOT resolve. Confirm the report + JSON export match the rows.

## 6. Mode B — sustained application failure (Test Console)

1. Endpoint `/`. Baseline: console `GET /` → 200, Safeguard healthy.
2. Console `POST /fault_injection/enable` (confirm modal). Assert console
   `GET /` → 500 **while** `GET /healthz` and `GET /readyz` stay 200 and
   `fault-status` reads `enabled`. A single `/status/500` request never
   causes `/` to fail — only sustained fault state (or a `/status/500`
   endpoint) produces consecutive failures.
3. Repeat the Mode A assertions (steps 2–5) against `/`.
4. Console `Reset all + verify` (fault disabled, readiness enabled,
   `fault-status`/`readyz`/`healthz`/`/` all green) **before** expecting
   recovery. Then repeat Mode A step 6.

## 7. Rollback

- Worker: restore the previous `/opt/devops-safeguard` checkout (or previous
  `.worker-build/` copy), remove/revert `MONITOR_ALLOWED_PRIVATE_HOSTS`,
  `systemctl restart`; startup log proves the reverted revision.
- Database: `drop index if exists public.incidents_one_active_per_service;`
  and `drop index if exists
  public.verification_runs_one_running_per_incident;` — forward-safe, the
  application runs with or without them.
- Project: set `project_configs.monitoring_enabled=false` to stop one demo
  without touching code.

## 8. Troubleshooting

| Symptom | Meaning / fix |
|---|---|
| `check_failed: Refusing to check non-public target` | Trust var missing on the worker host; set §3 value, restart. |
| `check_failed: ... trusted-target policy ...` | Host trusted but resolution not covered (e.g. DNS changed); inspect the reason, keep the IP literal form. |
| `Checks overdue` + no new rows | Worker down, DB unreachable, or project disabled — `journalctl`, then §3. |
| `23505` anywhere in logs | Concurrent tick lost a dedup race — normal, the pass still succeeds. |
| Incident never opens after 3+ 500s | Check `failureThreshold` on the project + that observations are `source='external'` (demo/simulation rows never count). |
| Incident resolves after 1 healthy | Regression — resolution requires 3 consecutive genuine healthy checks; capture rows and file a bug. |
| `worker.schema_unavailable` at startup | Migration §2 not applied; push, restart. |

## 9. Known limitation: DNS lookup vs connect

Trust is evaluated against the pre-flight DNS result. For IP literals (this
demo) the lookup returns the literal itself, so there is no window. For DNS
names, `fetch` re-resolves at connect time; a hostile or flapping DNS could
in theory answer differently between the two lookups. Mitigations in force:
exact-match allowlist, every-answer-must-be-covered rule, no credentialed
URLs, redirects never followed, bodies never stored. Operational rule: use
IP literals for trusted VPC targets; treat private DNS names as
second-choice with stable internal DNS.
