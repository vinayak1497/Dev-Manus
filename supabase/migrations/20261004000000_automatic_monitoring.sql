-- Phase 2: automatic monitoring — persistent scheduling state.
--
-- WHY THIS MIGRATION IS REQUIRED
-- ------------------------------
-- Phase 1 monitors a project only when a signed-in user clicks "Run HTTP
-- check" (app/projects/[id]/health-actions.ts). Nothing persisted WHEN a
-- project or service is next due, so an unattended worker could only either
-- probe every project on every tick (ignoring the configured `intervalSec`)
-- or derive cadence from `projects.last_checked_at` — a project-wide rollup
-- that says nothing about an individual service and is rewritten by manual
-- "Run monitor check" ticks as well. There was also nowhere to record "a
-- worker is already running this check", so two workers — or a worker plus a
-- manual check — would execute the same check twice and, worse, write the
-- same failure twice.
--
-- The Phase 1 schema is therefore insufficient in exactly three ways, and
-- this migration adds only those three things:
--
--   1. A per-service scheduling cursor and due time, so the stored
--      `project_configs.health.intervalSec` is enforced at runtime and
--      survives a worker restart (services.monitoring_last_check_at /
--      monitoring_next_check_at).
--   2. An atomic, expiring claim, so one check runs at most once even with
--      two worker instances, a crash mid-check, or a slow target
--      (services.monitoring_run_id / monitoring_lease_expires_at /
--      monitoring_worker_id).
--   3. A per-project switch so automatic monitoring can be turned off
--      without deleting configuration (project_configs.monitoring_enabled).
--
-- The claim is deliberately designed to expire: a worker that is killed
-- mid-check strands nothing, because its lease simply ages out and the work
-- becomes claimable again.
--
-- DELIBERATELY NOT ADDED
-- ----------------------
-- - No `consecutive_failures` column. The consecutive genuine-failure streak
--   is DERIVED from persisted `service_health_checks` rows where
--   `source = 'external' and is_demo = false` (see
--   lib/monitoring/failure-streak.ts). A stored counter could drift from the
--   observations it is supposed to summarise, could be double-incremented by
--   a retried write, and would need its own recovery story after a crash.
--   Deriving it makes "recorded exactly once" and "counted exactly once" the
--   same fact, and it survives restarts for free.
-- - No worker heartbeat table. "Is monitoring stale?" is answered from the
--   real scheduling columns (last real check vs. next due time), never from a
--   flag that could claim a worker is alive when it is not (RULE.md 9.1/9.2).
-- - No RLS policy changes. The worker authenticates with the Supabase service
--   role from a server-only process; that client bypasses RLS by design and
--   is never bundled into the browser. Every existing `authenticated` policy
--   is left exactly as it was, so application tenant isolation is unchanged.
--
-- Additive only: it alters no existing column and rewrites no existing
-- policy, so it is safe to apply to a database already running Phase 1.

-- ---------------------------------------------------------------------------
-- 1. Per-project automatic monitoring switch
-- ---------------------------------------------------------------------------

-- Defaults to true: a project that stored a valid HTTP health configuration
-- is monitored automatically. Operators disable it per project by setting
-- this to false — the stored health configuration is never deleted, so
-- re-enabling restores the previous cadence without re-onboarding.
alter table public.project_configs
  add column if not exists monitoring_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Per-service scheduling + claim state
-- ---------------------------------------------------------------------------

-- These live on `services` (not on `projects`) on purpose: RULE.md and the
-- Phase 1 discovery both treat a service as the unit that is checked. A
-- project-level cursor cannot express "this service is due, that one is not",
-- and `projects.last_checked_at` is a rollup that any manual monitor tick
-- rewrites.
alter table public.services
  add column if not exists monitoring_last_check_at timestamptz,
  add column if not exists monitoring_next_check_at timestamptz,
  add column if not exists monitoring_last_status text
    constraint services_monitoring_last_status_check
    check (monitoring_last_status is null or monitoring_last_status in (
      'healthy', 'warning', 'critical', 'unknown', 'maintenance', 'recovering'
    )),
  add column if not exists monitoring_last_error text,
  -- Claim identity. `monitoring_run_id` is also the primary key of the
  -- observation the run is allowed to write, which makes a retried insert a
  -- no-op instead of a duplicate observation.
  add column if not exists monitoring_run_id uuid,
  add column if not exists monitoring_lease_expires_at timestamptz,
  add column if not exists monitoring_worker_id text;

-- Comment kept short on purpose: the columns hold operator-facing diagnostics
-- (a refused target, a failed write), never credentials or response bodies
-- (RULE.md 11, 24).
comment on column public.services.monitoring_last_error is
  'Last automatic-scheduling error for this service (operator-facing text only; never secrets or response bodies).';

comment on column public.services.monitoring_run_id is
  'Identity of the in-flight (or last completed) automatic check. Doubles as the observation id so a retried insert cannot duplicate an observation.';

comment on column public.services.monitoring_lease_expires_at is
  'When the current claim expires. An expired claim is reclaimable, so a crashed worker strands no work.';

-- ---------------------------------------------------------------------------
-- 3. Indexes for the two read paths the scheduler actually uses
-- ---------------------------------------------------------------------------

-- "Which services are due?" — a partial index because only automatically
-- monitored services ever carry a due time, and every worker poll hits this.
create index if not exists services_monitoring_due_idx
  on public.services (monitoring_next_check_at)
  where monitoring_next_check_at is not null;

-- "Which claims are live?" — used by shutdown to release only this worker's
-- own leases, never another instance's.
create index if not exists services_monitoring_lease_idx
  on public.services (monitoring_lease_expires_at)
  where monitoring_lease_expires_at is not null;