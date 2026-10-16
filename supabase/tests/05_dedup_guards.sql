-- Verifies the incident deduplication guards: at most one ACTIVE incident
-- per service, and at most one RUNNING verification run per incident.
--
-- These are partial unique indexes, so resolved incidents and finished runs
-- stay untouched as history. Application code treats a 23505 conflict as
-- normal deduplication (see lib/detection/monitor.ts), never as a pass
-- failure.
--
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f 05_dedup_guards.sql

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data)
values ('77777777-7777-7777-7777-777777777777', 'dedup@example.com',
        '{"display_name":"Dedup Owner"}')
on conflict (id) do nothing;

do $$
declare
  v_user    constant uuid := '77777777-7777-7777-7777-777777777777';
  v_org     uuid := '88888888-8888-8888-8888-888888888888';
  v_project uuid := '99999999-9999-9999-9999-999999999999';
  v_service uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_first   uuid;
  v_second  uuid;
  v_run     uuid;
  v_raised  boolean;
begin
  perform set_config('request.jwt.claim.sub', v_user::text, false);

  insert into public.organizations (id, name, created_by)
  values (v_org, 'Dedup Org', v_user);
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner');
  insert into public.projects (id, organization_id, name, slug, created_by)
  values (v_project, v_org, 'Dedup Project', 'dedup-project', v_user);
  insert into public.services (id, project_id, name, kind, is_demo)
  values (v_service, v_project, 'Application endpoint', 'http-endpoint', false);

  ------------------------------------------------------------------
  -- 1. The guard indexes exist
  ------------------------------------------------------------------
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'incidents_one_active_per_service'
  ) then
    raise exception 'FAIL: incidents_one_active_per_service index is missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'verification_runs_one_running_per_incident'
  ) then
    raise exception 'FAIL: verification_runs_one_running_per_incident index is missing';
  end if;

  ------------------------------------------------------------------
  -- 2. A second active incident for the same service is refused
  ------------------------------------------------------------------
  insert into public.incidents (project_id, service_id, title, severity, status)
  values (v_project, v_service, 'Dedup service is failing', 'critical', 'open')
  returning id into v_first;

  v_raised := false;
  begin
    insert into public.incidents (project_id, service_id, title, severity, status)
    values (v_project, v_service, 'Duplicate open', 'critical', 'open');
  exception when unique_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL: a second active incident for one service was allowed';
  end if;

  ------------------------------------------------------------------
  -- 3. Resolving the first incident frees the service for a new one,
  --    and history is preserved
  ------------------------------------------------------------------
  update public.incidents set status = 'resolved', resolved_at = now()
  where id = v_first;

  insert into public.incidents (project_id, service_id, title, severity, status)
  values (v_project, v_service, 'Second outage', 'critical', 'open')
  returning id into v_second;

  if (select count(*) from public.incidents where service_id = v_service) <> 2 then
    raise exception 'FAIL: resolved history plus the new active incident should coexist';
  end if;

  ------------------------------------------------------------------
  -- 4. A second running verification for one incident is refused,
  --    finished runs stay allowed
  ------------------------------------------------------------------
  insert into public.verification_runs (incident_id, status, checks_required, checks_passed)
  values (v_second, 'running', 3, 1)
  returning id into v_run;

  v_raised := false;
  begin
    insert into public.verification_runs (incident_id, status, checks_required, checks_passed)
    values (v_second, 'running', 3, 1);
  exception when unique_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL: a second running verification for one incident was allowed';
  end if;

  insert into public.verification_runs (incident_id, status, checks_required, checks_passed)
  values (v_second, 'passed', 3, 3);

  update public.verification_runs set status = 'passed', completed_at = now()
  where id = v_run;

  insert into public.verification_runs (incident_id, status, checks_required, checks_passed)
  values (v_second, 'running', 3, 1);

  ------------------------------------------------------------------
  -- 5. Incidents without a service are outside the per-service guard
  ------------------------------------------------------------------
  insert into public.incidents (project_id, service_id, title, severity, status)
  values (v_project, null, 'Orphan note one', 'low', 'open');
  insert into public.incidents (project_id, service_id, title, severity, status)
  values (v_project, null, 'Orphan note two', 'low', 'open');
end $$;
