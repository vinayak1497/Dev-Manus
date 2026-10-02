-- Phase 2b: the detection + verification substrate (acceptance §107 steps
-- OBSERVE -> DETECT and VERIFY). Additive only; it never alters the tables from
-- 20261001000000_incident_domain.sql, it adds the two things that migration
-- deliberately left out:
--
--   * service_health_checks - the raw observed health signal a monitor probe
--     records. The controlled-failure simulation writes UNHEALTHY checks here;
--     it does NOT create incidents. A separate detection pass reads these and
--     decides. This is what keeps the architecture OBSERVE -> DETECT and never
--     BUTTON -> INCIDENT.
--   * verification_runs - after a human-approved remediation, recovery is only
--     confirmed by N consecutive healthy checks, tracked here. One success is
--     never enough (§17 / §10).
--
-- Both tables are project/incident scoped and protected by the same
-- SECURITY DEFINER membership helpers (can_access_project / can_access_incident)
-- proven in the incident-domain migration, so tenant isolation stays in RLS,
-- never in app code. Demo rows carry is_demo = true (RULE.md §9).

-- ---------------------------------------------------------------------------
-- 1. service_health_checks - observed signal (never assumed)
-- ---------------------------------------------------------------------------

create table public.service_health_checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  status text not null
    constraint service_health_checks_status_check
    check (status in (
      'healthy', 'warning', 'critical', 'unknown', 'maintenance', 'recovering'
    )),
  -- Where the reading came from. 'simulation' marks the controlled demo
  -- failure so it is never mistaken for a real probe.
  source text not null default 'probe'
    constraint service_health_checks_source_check
    check (source in ('probe', 'synthetic', 'external', 'simulation')),
  latency_ms integer
    constraint service_health_checks_latency_check
    check (latency_ms is null or latency_ms >= 0),
  error_rate numeric(5, 4)
    constraint service_health_checks_error_rate_check
    check (error_rate is null or (error_rate >= 0 and error_rate <= 1)),
  detail text,
  metadata jsonb,
  is_demo boolean not null default false,
  checked_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. verification_runs - post-remediation recovery confirmation
-- ---------------------------------------------------------------------------

create table public.verification_runs (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  remediation_action_id uuid
    references public.remediation_actions (id) on delete set null,
  status text not null default 'running'
    constraint verification_runs_status_check
    check (status in ('running', 'passed', 'failed', 'cancelled')),
  -- Recovery needs checks_required consecutive healthy observations; a single
  -- healthy check never resolves an incident.
  checks_required integer not null default 3
    constraint verification_runs_required_check check (checks_required >= 1),
  checks_passed integer not null default 0
    constraint verification_runs_passed_check check (checks_passed >= 0),
  detail text,
  is_demo boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 2b. Typed remediation action_type - the allowlist, enforced in the database
-- ---------------------------------------------------------------------------
-- 20261001000000's remediation_actions stores a human-readable title and an
-- (unused, never-shell) command field. The engine executes ONLY a typed action
-- from the closed allowlist (lib/remediation/actions.ts), so we persist that
-- type in a dedicated column with a CHECK: the allowlist is enforced at the
-- database too, not only in application code. There is deliberately no value
-- for arbitrary command execution. Nullable, because a free-form human note
-- action need not carry one - and the engine refuses to execute any row whose
-- action_type is null.
alter table public.remediation_actions
  add column if not exists action_type text
    constraint remediation_actions_action_type_check
    check (action_type is null or action_type in (
      'RESTART_DEMO_SERVICE', 'RETRY_HEALTH_CHECK', 'ROLLBACK_DEMO_DEPLOYMENT'
    ));

-- ---------------------------------------------------------------------------
-- 3. Row Level Security - same membership helpers as the incident domain
-- ---------------------------------------------------------------------------

alter table public.service_health_checks enable row level security;
alter table public.verification_runs enable row level security;

-- Health checks are keyed on project_id (a monitor writes them per project).
create policy "service_health_checks_select" on public.service_health_checks
  for select to authenticated using (public.can_access_project(project_id));
create policy "service_health_checks_insert" on public.service_health_checks
  for insert to authenticated with check (public.can_access_project(project_id));
create policy "service_health_checks_update" on public.service_health_checks
  for update to authenticated using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));
create policy "service_health_checks_delete" on public.service_health_checks
  for delete to authenticated using (public.can_access_project(project_id));

-- Verification runs are reached through their incident.
create policy "verification_runs_select" on public.verification_runs
  for select to authenticated using (public.can_access_incident(incident_id));
create policy "verification_runs_insert" on public.verification_runs
  for insert to authenticated with check (public.can_access_incident(incident_id));
create policy "verification_runs_update" on public.verification_runs
  for update to authenticated using (public.can_access_incident(incident_id))
  with check (public.can_access_incident(incident_id));
create policy "verification_runs_delete" on public.verification_runs
  for delete to authenticated using (public.can_access_incident(incident_id));

-- ---------------------------------------------------------------------------
-- 4. Indexes for the read paths the detector + UI use
-- ---------------------------------------------------------------------------

-- Detection reads the most recent checks per service.
create index service_health_checks_service_time_idx
  on public.service_health_checks (service_id, checked_at desc);
create index service_health_checks_project_time_idx
  on public.service_health_checks (project_id, checked_at desc);
-- Verification reads the active run for an incident.
create index verification_runs_incident_started_idx
  on public.verification_runs (incident_id, started_at desc);
