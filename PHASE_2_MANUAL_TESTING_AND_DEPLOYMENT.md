# Phase 2 — Manual Testing & Deployment Guide

**DevOps Safeguard automatic monitoring.** Follow this file top to bottom to go
from a checkout to an EC2 host that monitors your applications with the browser
closed. Every command below was verified against this repository; nothing here
is invented. Do not paste real credentials into any file you commit.

What Phase 2 added, in one paragraph: a standalone Node.js worker
(`worker/monitor-worker.ts`, built to `.worker-build/`) runs the existing
Phase 1 HTTP check for every project that has automatic monitoring switched on,
on the project's own stored `intervalSec` cadence. Results are persisted as
genuine `source='external'` observations, the stored `failureThreshold` gates
incident creation, and the existing verification state machine resolves the
incident after the required healthy checks. Scheduling state lives in Postgres
(`services.monitoring_*` + `project_configs.monitoring_enabled`, added by
`supabase/migrations/20261004000000_automatic_monitoring.sql`), so a restart
loses nothing.

---

## 1. Prerequisites

- Node.js >= 18.18 (the repo's `engines` field; 22.x verified).
- This repository, dependencies installed (`npm install`).
- A Supabase project with **all** migrations applied, including the new one:

  ```powershell
  supabase db push
  ```

  Verify the Phase 2 columns exist:

  ```sql
  select column_name from information_schema.columns
  where table_name = 'services' and column_name like 'monitoring%';
  -- monitoring_last_check_at, monitoring_last_error, monitoring_last_status,
  -- monitoring_lease_expires_at, monitoring_next_check_at, monitoring_run_id,
  -- monitoring_worker_id
  select column_name from information_schema.columns
  where table_name = 'project_configs' and column_name = 'monitoring_enabled';
  ```

- The **service-role key** for that Supabase project
  (dashboard > Project Settings > API > `service_role`, or the newer
  `sb_secret_...` key). The worker cannot use the anon key: it has no user
  session, and row-level security scopes every anon query to `auth.uid()`.
  The key stays server-side only — never in a `NEXT_PUBLIC_*` variable, never
  in the browser bundle, never in a log (the worker redacts credential-shaped
  fields before writing anything).

## 2. Environment variables

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | — | Same Supabase URL the app uses |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | yes | — | Server-only credential |
| `MONITOR_WORKER_ENABLED` | no | `true` | `false` = exit without monitoring |
| `MONITOR_WORKER_POLL_SECONDS` | no | `10` | Seconds between passes (2–3600). Keep ≤ 10 or the smallest `intervalSec` runs late |
| `MONITOR_WORKER_CONCURRENCY` | no | `4` | Simultaneous checks (1–16) |
| `MONITOR_WORKER_BATCH_LIMIT` | no | `200` | Projects considered per pass (1–1000) |
| `MONITOR_WORKER_LEASE_SECONDS` | no | `120` | Claim lifetime after a crash (30–3600) |
| `MONITOR_WORKER_ID` | no | `worker-<host>-<pid>` | Identity in logs and `services.monitoring_worker_id` |
| `MONITOR_WORKER_PROJECT_ID` | no | all enabled | Restrict a run to one project |
| `MONITOR_WORKER_ONCE` | no | `false` | Same as the `--once` flag |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, `error` |

Check your configuration without exposing secrets (prints presence, never values):

```powershell
node .worker-build/worker/monitor-worker.js --help
```

Start with a deliberately broken config to see startup validation fail fast:

```powershell
# (temporarily unset the key) → expect exit code 1 and:
#   devops-safeguard monitoring worker: cannot start
#     - No server-side Supabase credential found. ...
```

Set the real values as process environment (PowerShell session, lost on close):

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
```

For local development the worker also reads `.env.local` then `.env` (same
precedence as Next.js), but a real environment variable always wins — which is
what the systemd unit relies on.

## 3. Build

```powershell
npm run worker:build
# compiles worker/ + the lib/ modules it uses to .worker-build/ (CommonJS)
```

`npm run verify` (`tsc --noEmit` + `next lint`) typechecks the app **and** the
worker. Do not run `next build` while `next dev` is running — they share one
`.next` directory and the dev server will lose its assets (RULE.md §18).

## 4. Run the worker locally

Continuous (what production runs):

```powershell
npm run worker
```

One pass and exit (safe smoke test — checks only what is due, then stops):

```powershell
npm run worker:once
```

One pass for a single project:

```powershell
node .worker-build/worker/monitor-worker.js --once --project <project-uuid>
```

Stop it with `Ctrl+C` (SIGINT). On Linux/systemd, `systemctl stop` sends
SIGTERM: the worker finishes the in-flight pass, releases its own claims so a
restart resumes immediately, and exits. (On Windows, `taskkill` terminates the
process without delivering the signal — the expired lease recovers the work
anyway; see §10.)

Worker log lines are one JSON object each (`worker.pass_completed` carries
`eligible/due/checked/failed/skipped/ineligible` per pass).

## 5. Onboard a test application

1. Open the app, sign in, and run the **Add Project** wizard (Projects > New).
2. On the health step choose method **HTTP** and enter:
   - Target URL, e.g. `https://example.com`
   - Endpoint path, e.g. `/` (must return your `expectedStatus`)
   - Expected status `200`, interval `30`, timeout `5`, failures-to-alert `3`.
   - Only **public** endpoints are supported: credentials in the URL are
     refused, private/loopback/link-local targets are refused before and after
     DNS, redirects are recorded — never followed — and TLS is always verified.
3. Finish the wizard (**Review → Start Monitoring**). This writes `projects` +
   `project_configs.health` (the 8 fields verbatim) with `monitoring_enabled`
   defaulting to **true** and `monitoring_status` = `pending`. No service row
   exists yet — the worker creates the canonical `Application endpoint` row on
   its first pass (idempotent on `project_id + name`).

## 6. Verify automatic checks (no clicks, browser closed)

1. Make sure the wizard project above exists and the worker is **not** running.
2. Start the worker (`npm run worker`), then close the browser / sign out —
   monitoring must not depend on either.
3. Within ~one `intervalSec`, check Supabase (`service_health_checks`, newest
   first for your project):

   - exactly one new row per interval: `source='external'`, `is_demo=false`,
     `status='healthy'`, `latency_ms>=0`, `metadata.status_code=200`,
     `metadata.checked_url` = the dashboard's "Checked URL";
   - `services` keeps one row (`Application endpoint`, `kind='http-endpoint'`,
     `is_demo=false`); `monitoring_last_check_at` = the observation time,
     `monitoring_next_check_at` ≈ last check + `intervalSec`;
   - `project_configs.monitoring_status` flipped `pending` → `active`;
   - the project dashboard shows the service Healthy and the Automatic
     monitoring panel shows the last/next check. It never claims "worker
     running" — only what the schedule proves.

4. Confirm the cadence: two consecutive `monitoring_last_check_at` values are
   `intervalSec` apart (to the second), and no extra rows appear between them.

## 7. Simulate an outage and recovery

1. Point the endpoint at a failing path. The honest way is a real one: change
   **Endpoint path** to something that returns a non-2xx on your target, or
   stop the target application. (In Supabase Studio you can edit
   `project_configs.health` JSONB directly for a drill; the worker re-reads it
   every pass.)
2. Wait `intervalSec × failureThreshold`. With the defaults above (30s × 3)
   that is ~90 seconds. Assert:
   - every check is recorded (`status='warning'` for 4xx/redirects,
     `'critical'` for 5xx/timeouts/refusals), **including the ones below the
     threshold**;
   - no incident after the 1st and 2nd consecutive failure; the service row
     still shows the real failure status;
   - exactly **one** incident after the 3rd (`title` names the service);
   - further failures add observations but no second active incident.
3. Restore the healthy endpoint and wait `intervalSec × 3`
   (`DEFAULT_VERIFICATION_CHECKS`). Assert the incident moves
   `open → monitoring → resolved`, `verification_runs` ends `passed`, and the
   service returns to Healthy. One or two healthy checks alone must **not**
   resolve it.
4. Dashboard check: incident list shows the resolved incident with its
   evidence; the Automatic monitoring panel shows consecutive failures back at
   `0 of 3`.

## 8. Inspect worker logs and systemd state (EC2)

```bash
sudo journalctl -u devops-safeguard-worker -f
sudo journalctl -u devops-safeguard-worker --since "1 hour ago" | grep -c check_completed
sudo systemctl status devops-safeguard-worker
sudo systemctl restart devops-safeguard-worker
```

A healthy service logs `worker.pass_completed` every `POLL_SECONDS` with
`ok:true`; `due:0/skipped:N` between checks is normal — it means the schedule
is being honoured, not that anything is broken.

## 9. Install / enable on EC2

On the EC2 host (Amazon Linux / Ubuntu, Node 20+ installed):

```bash
# 1. check out the app (example path used by the unit file)
sudo mkdir -p /opt/devops-safeguard /etc/devops-safeguard
sudo useradd --system --home /opt/devops-safeguard --shell /usr/sbin/nologin devops-safeguard
# 2. deploy the code as that user, then as that user:
cd /opt/devops-safeguard && npm install && npm run worker:build
# 3. install the unit + environment template from this repo
sudo cp deploy/devops-safeguard-worker.service /etc/systemd/system/
sudo cp deploy/worker.env.example /etc/devops-safeguard/worker.env
sudo $EDITOR /etc/devops-safeguard/worker.env   # fill in the two required values
sudo chown root:devops-safeguard /etc/devops-safeguard/worker.env
sudo chmod 600 /etc/devops-safeguard/worker.env
sudo chown -R devops-safeguard:devops-safeguard /opt/devops-safeguard
# 4. apply the database migration from any machine with the Supabase CLI
supabase db push
# 5. enable + start
sudo systemctl daemon-reload
sudo systemctl enable --now devops-safeguard-worker
sudo systemctl status devops-safeguard-worker
```

Deploying a new version later:

```bash
cd /opt/devops-safeguard && git pull && npm install && npm run worker:build && npm run verify
sudo systemctl restart devops-safeguard-worker
```

systemd restarts the worker on crash (`Restart=on-failure`); scheduling state
is in Postgres, so a restart neither repeats a completed check nor loses the
next due time.

## 10. Disable automatic monitoring safely

- **One project:** in Supabase, set that project's
  `project_configs.monitoring_enabled = false`. The worker stops selecting it;
  the stored health configuration is kept, so re-enabling restores the same
  schedule. The dashboard shows "Automatic monitoring off".
- **Everything (keep the service installed):** set `MONITOR_WORKER_ENABLED=false`
  in `/etc/devops-safeguard/worker.env` and restart — the worker exits 0
  without monitoring.
- **Everything (remove):** `sudo systemctl disable --now devops-safeguard-worker`.
  In-flight claims expire by themselves (`MONITOR_WORKER_LEASE_SECONDS`).

## 11. Run the automated suites

```powershell
npm run verify      # tsc --noEmit + next lint (app AND worker)
npm run test:unit   # 219 deterministic unit tests, stdlib only
npm run test:db     # throwaway Postgres in Docker: migrations + RLS + claim/lease assertions
```

`npm run test:db` needs Docker. The end-to-end suite needs a live Supabase
(local `supabase start` recommended — it must have the migrations applied):

```powershell
$env:E2E_SUPABASE_URL="http://127.0.0.1:54321"
$env:E2E_SUPABASE_SECRET_KEY="<service role / sb_secret_ key of THAT stack>"
npm run test:e2e
```

It creates and deletes its own users/orgs/projects (clearly labelled), runs
the real scheduler → real HTTP check → real incident → real recovery path, and
cleans up afterwards.

## 12. Troubleshooting

| Symptom | What it means | Fix |
|---|---|---|
| `cannot start: No server-side Supabase credential` (exit 1) | Key missing | Set `SUPABASE_SERVICE_ROLE_KEY`; make sure it is not a `NEXT_PUBLIC_*` var |
| `worker.schema_unavailable` at startup (exit 1) | New columns missing | `supabase db push`; restart the worker |
| Passes log `eligible:0` forever | Nothing configured or all disabled | Onboard an HTTP health check; check `monitoring_enabled` |
| `scheduler.project_ineligible: no runnable HTTP health check` | `method` isn't `http`, or target/endpoint missing | Complete the health step; `port`/`container` methods have no probe |
| `scheduler.check_failed: Refusing to check internal target` | SSRF guard doing its job | Use a public endpoint; never weaken the guard for tests |
| `monitoring_last_error` set, retry scheduled | Transient/config failure | Read the error text on the dashboard; the worker backs off automatically |
| Dashboard badge **Checks overdue** | Next due time passed with no new observation | Worker not running, DB unreachable, or project disabled — check `journalctl` |
| Two workers, one check each time | Correct | The lease guarantees a single winner; the loser logs `claim_lost` |
| App renders unstyled after a build | `next build` ran while `next dev` was serving (shared `.next`) | Stop dev, `npm run clean`, restart dev (RULE.md §18) |
| Login fails on a `next start` host after env changes | `NEXT_PUBLIC_*` is baked at **build** time | Rebuild (`npm run build`) and restart the server |
