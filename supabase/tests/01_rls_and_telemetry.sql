-- Verifies the Phase 1 migrations behave correctly for a signed-up user.
--
-- Run as a superuser (so the test can seed auth.users) but the assertions
-- run under `set role authenticated` — otherwise the table owner would
-- bypass RLS and every isolation check would pass vacuously.
--
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f 01_rls_and_telemetry.sql

\set ON_ERROR_STOP on

-- Fixtures must exist before we drop privileges.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'demo@example.com',
        '{"display_name":"Demo Owner"}')
on conflict (id) do nothing;

insert into auth.users (id, email, raw_user_meta_data)
values ('22222222-2222-2222-2222-222222222222', 'other@example.com', '{}')
on conflict (id) do nothing;

set role authenticated;

do $$
declare
  v_user  constant uuid := '11111111-1111-1111-1111-111111111111';
  v_other constant uuid := '22222222-2222-2222-2222-222222222222';
  v_org_a uuid;
  v_org_b uuid;
  v_seen  int;
begin
  perform set_config('request.jwt.claim.sub', v_user::text, false);

  ------------------------------------------------------------------
  -- 1. Sign-up trigger created a profile and carried the name over
  ------------------------------------------------------------------
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'FAIL: trigger did not create a profiles row';
  end if;

  if (select display_name from public.profiles where id = v_user)
       is distinct from 'Demo Owner' then
    raise exception 'FAIL: display_name was not carried over from user_metadata';
  end if;

  ------------------------------------------------------------------
  -- 2. Reads must not raise "infinite recursion detected in policy"
  ------------------------------------------------------------------
  perform 1 from public.organizations;
  perform 1 from public.organization_members;
  perform 1 from public.projects;

  ------------------------------------------------------------------
  -- 3. Onboarding: create an org, enrol in it, insert a project
  ------------------------------------------------------------------
  insert into public.organizations (name, created_by)
  values ('Acme', v_user) returning id into v_org_a;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_a, v_user, 'owner');

  insert into public.projects (organization_id, name, slug, created_by)
  values (v_org_a, 'ShopEasy', 'shopeasy', v_user);

  if not exists (
    select 1 from public.projects p
    where p.organization_id = v_org_a and p.slug = 'shopeasy'
  ) then
    raise exception 'FAIL: user cannot read back their own project';
  end if;

  ------------------------------------------------------------------
  -- 4. New telemetry columns exist and accept data
  ------------------------------------------------------------------
  update public.projects
     set environment   = 'Production',
         repository    = 'github.com/company/shopeasy',
         health        = 'critical',
         service_count = 12,
         active_incident_count = 1,
         last_checked_at = now(),
         health_warning = 'Pool exhausted',
         deployment_version = 'v1.8.2',
         deployment_commit = 'a8f302',
         deployment_status = 'failed',
         deployed_at = now(),
         is_demo = true
   where organization_id = v_org_a;

  if (select is_demo from public.projects where organization_id = v_org_a)
       is not true then
    raise exception 'FAIL: is_demo did not persist';
  end if;

  if (select health from public.projects where organization_id = v_org_a)
       is distinct from 'critical' then
    raise exception 'FAIL: health did not persist';
  end if;

  ------------------------------------------------------------------
  -- 5. Health values outside the allowed set must be rejected
  ------------------------------------------------------------------
  begin
    update public.projects set health = 'on-fire'
     where organization_id = v_org_a;
    raise exception 'FAIL: invalid health value was accepted';
  exception when check_violation then
    null; -- expected
  end;

  ------------------------------------------------------------------
  -- 6. Tenant isolation: another user sees nothing of ours
  ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_other::text, false);

  select count(*) into v_seen from public.projects;
  if v_seen <> 0 then
    raise exception 'FAIL: tenant isolation broken, other user sees % rows', v_seen;
  end if;

  select count(*) into v_seen from public.organizations;
  if v_seen <> 0 then
    raise exception 'FAIL: org isolation broken, other user sees % orgs', v_seen;
  end if;

  -- may enrol only in an org they created
  insert into public.organizations (name, created_by)
  values ('Other Co', v_other) returning id into v_org_b;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_b, v_other, 'owner');

  -- may NOT enrol in somebody else's org
  begin
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org_a, v_other, 'member');
    raise exception 'FAIL: cross-tenant enrolment was allowed';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- may NOT insert a project into somebody else's org
  begin
    insert into public.projects (organization_id, name, slug, created_by)
    values (v_org_a, 'Sneaky', 'sneaky', v_other);
    raise exception 'FAIL: cross-tenant project insert was allowed';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- may NOT update somebody else's project
  begin
    update public.projects set name = 'Hacked'
     where organization_id = v_org_a;
    if found then
      raise exception 'FAIL: cross-tenant update was allowed';
    end if;
  exception when insufficient_privilege then
    null; -- expected
  end;

  ------------------------------------------------------------------
  -- 7. Delete is scoped to the caller's own organization
  ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user::text, false);
  delete from public.projects where is_demo = true;
  if exists (select 1 from public.projects) then
    raise exception 'FAIL: owner could not delete their own demo rows';
  end if;

  raise notice 'PASS: all Phase 1 RLS and telemetry checks succeeded';
end
$$;

reset role;
