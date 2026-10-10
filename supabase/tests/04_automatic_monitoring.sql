-- Verifies the Phase 2 automatic-monitoring migration: the scheduling
-- columns, their constraints, the due-work index, and the exact claim
-- behaviour the worker depends on.
--
-- The claim assertions matter most. They run as plain SQL against real row
-- locks — the same single conditional UPDATE the worker issues through
-- PostgREST — so "two workers cannot check the same service twice" is proven
-- by the database, not by a mock.
--
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f 04_automatic_monitoring.sql

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data)
values ('33333333-3333-3333-3333-333333333333', 'scheduler@example.com',
        '{"display_name":"Scheduler Owner"}')
on conflict (id) do nothing;

do $$
declare
  v_user    constant uuid := '33333333-3333-3333-3333-333333333333';
  v_org     uuid;
  v_project uuid;
  v_service uuid;
  v_claimed int;
begin
  perform set_config('request.jwt.claim.sub', v_user::text, false);

  insert into public.organizations (id, name, created_by)
  values ('44444444-4444-4444-4444-444444444444', 'Scheduler Org', v_user);
  insert into public.organization_members (organization_id, user_id, role)
  values ('44444444-4444-4444-4444-444444444444', v_user, 'owner');

  insert into public.projects (id, organization_id, name, slug, created_by)
  values ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444',
          'Scheduler Project', 'scheduler-project', v_user);

  insert into public.services (id, project_id, name, kind, is_demo)
  values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555',
          'Application endpoint', 'http-endpoint', false)
  returning id into v_service;

  ------------------------------------------------------------------
  -- 1. project_configs.monitoring_enabled defaults to on
  ------------------------------------------------------------------
  insert into public.project_configs (project_id)
  values ('55555555-5555-5555-5555-555555555555');

  if not exists (
    select 1 from public.project_configs
    where project_id = '55555555-5555-5555-5555-555555555555'
      and monitoring_enabled
  ) then
    raise exception 'FAIL: monitoring_enabled did not default to true';
  end if;

  ------------------------------------------------------------------
  -- 2. The scheduling columns exist and start empty
  ------------------------------------------------------------------
  if not exists (
    select 1 from public.services
    where id = v_service
      and monitoring_next_check_at is null
      and monitoring_last_check_at is null
      and monitoring_last_status is null
      and monitoring_run_id is null
      and monitoring_lease_expires_at is null
      and monitoring_worker_id is null
  ) then
    raise exception 'FAIL: a new service did not start with empty scheduling state';
  end if;

  ------------------------------------------------------------------
  -- 3. A never-scheduled service is immediately due and claimable
  ------------------------------------------------------------------
  update public.services
     set monitoring_run_id = gen_random_uuid(),
         monitoring_worker_id = 'worker-a',
         monitoring_lease_expires_at = now() + interval '120 seconds'
   where id = v_service
     and (monitoring_next_check_at is null
          or monitoring_next_check_at <= now())
     and (monitoring_lease_expires_at is null
          or monitoring_lease_expires_at <= now());
  get diagnostics v_claimed = row_count;
  if v_claimed <> 1 then
    raise exception 'FAIL: a never-scheduled service was not claimable';
  end if;

  ------------------------------------------------------------------
  -- 4. A live lease blocks a SECOND worker (no duplicate execution)
  ------------------------------------------------------------------
  update public.services
     set monitoring_run_id = gen_random_uuid(),
         monitoring_worker_id = 'worker-b',
         monitoring_lease_expires_at = now() + interval '120 seconds'
   where id = v_service
     and (monitoring_next_check_at is null
          or monitoring_next_check_at <= now())
     and (monitoring_lease_expires_at is null
          or monitoring_lease_expires_at <= now());
  get diagnostics v_claimed = row_count;
  if v_claimed <> 0 then
    raise exception 'FAIL: a second worker claimed a service that was already claimed';
  end if;
  if (select monitoring_worker_id from public.services where id = v_service) <> 'worker-a' then
    raise exception 'FAIL: the losing worker overwrote the winning claim';
  end if;

  ------------------------------------------------------------------
  -- 5. An EXPIRED lease is reclaimable, so a crashed worker strands nothing
  ------------------------------------------------------------------
  update public.services
     set monitoring_lease_expires_at = now() - interval '1 second'
   where id = v_service;

  update public.services
     set monitoring_run_id = gen_random_uuid(),
         monitoring_worker_id = 'worker-c',
         monitoring_lease_expires_at = now() + interval '120 seconds'
   where id = v_service
     and (monitoring_next_check_at is null
          or monitoring_next_check_at <= now())
     and (monitoring_lease_expires_at is null
          or monitoring_lease_expires_at <= now());
  get diagnostics v_claimed = row_count;
  if v_claimed <> 1 then
    raise exception 'FAIL: an expired claim could not be recovered';
  end if;

  ------------------------------------------------------------------
  -- 6. A future due time blocks the claim (interval is enforced)
  ------------------------------------------------------------------
  update public.services
     set monitoring_lease_expires_at = null,
         monitoring_worker_id = null,
         monitoring_next_check_at = now() + interval '300 seconds'
   where id = v_service;

  update public.services
     set monitoring_run_id = gen_random_uuid(),
         monitoring_worker_id = 'worker-d',
         monitoring_lease_expires_at = now() + interval '120 seconds'
   where id = v_service
     and (monitoring_next_check_at is null
          or monitoring_next_check_at <= now())
     and (monitoring_lease_expires_at is null
          or monitoring_lease_expires_at <= now());
  get diagnostics v_claimed = row_count;
  if v_claimed <> 0 then
    raise exception 'FAIL: a service was checked before it was due';
  end if;

  ------------------------------------------------------------------
  -- 7. The due-work index exists (the worker polls it on every pass)
  ------------------------------------------------------------------
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'services_monitoring_due_idx'
  ) then
    raise exception 'FAIL: services_monitoring_due_idx is missing';
  end if;

  ------------------------------------------------------------------
  -- 8. monitoring_last_status only accepts a real service status
  ------------------------------------------------------------------
  begin
    update public.services
       set monitoring_last_status = 'definitely-not-a-status'
     where id = v_service;
    raise exception 'FAIL: monitoring_last_status accepted an invalid value';
  exception
    when check_violation then null;
  end;

  ------------------------------------------------------------------
  -- 9. Existing application RLS is untouched by this migration
  ------------------------------------------------------------------
  set local role authenticated;
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'services') = 0 then
    raise exception 'FAIL: services RLS policies disappeared';
  end if;
  set local role none;

  ------------------------------------------------------------------
  -- Clean up so repeated runs stay idempotent.
  ------------------------------------------------------------------
  delete from public.services where id = v_service;
  delete from public.projects where id = '55555555-5555-5555-5555-555555555555';
  delete from public.organizations where id = '44444444-4444-4444-4444-444444444444';
end
$$;

\echo '04_automatic_monitoring: OK'