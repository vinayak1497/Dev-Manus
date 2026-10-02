-- Verifies Phase 3 (project onboarding) RLS: drafts are owner-private,
-- configs + env vars are project-scoped through can_access_project().
-- Secrets persist as NAMES + presence only (value IS NULL when is_secret),
-- and a draft_id maps to at most one project (unique).
--
-- Run as a superuser (to seed auth.users) but assertions run under
-- `set role authenticated`, otherwise the table owner bypasses RLS.

\set ON_ERROR_STOP on

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
  v_user   constant uuid := '11111111-1111-1111-1111-111111111111';
  v_other  constant uuid := '22222222-2222-2222-2222-222222222222';
  v_org_a  uuid;
  v_org_b  uuid;
  v_proj_a uuid;
  v_seen   int;
begin
  ------------------------------------------------------------------
  -- 1. User A onboards: org, membership, project
  ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user::text, false);

  insert into public.organizations (name, created_by)
  values ('Onboard Co A', v_user) returning id into v_org_a;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_a, v_user, 'owner');

  insert into public.projects (organization_id, name, slug, created_by, environment)
  values (v_org_a, 'Shop API', 'shop-api', v_user, 'Production')
  returning id into v_proj_a;

  ------------------------------------------------------------------
  -- 2. Drafts are owner-private and idempotent on draft_id
  ------------------------------------------------------------------
  insert into public.project_drafts (draft_id, organization_id, created_by, current_step, status, wizard_state)
  values ('draft-aaa', v_org_a, v_user, 'review', 'draft', '{"basics":{"name":"Shop API"}}');

  -- same draft_id twice must be rejected (Review -> create runs once)
  begin
    insert into public.project_drafts (draft_id, organization_id, created_by)
    values ('draft-aaa', v_org_a, v_user);
    raise exception 'FAIL: duplicate draft_id was allowed';
  exception when unique_violation then
    null; -- expected
  end;

  -- other user cannot see our draft
  perform set_config('request.jwt.claim.sub', v_other::text, false);
  select count(*) into v_seen from public.project_drafts where draft_id = 'draft-aaa';
  if v_seen <> 0 then
    raise exception 'FAIL: draft leaked to another user (% rows)', v_seen;
  end if;

  -- other user cannot mark our draft created
  begin
    update public.project_drafts set status = 'created' where draft_id = 'draft-aaa';
    if found then
      raise exception 'FAIL: cross-user draft update was allowed';
    end if;
  exception when insufficient_privilege then
    null; -- also acceptable (policy blocks the write)
  end;

  perform set_config('request.jwt.claim.sub', v_user::text, false);

  ------------------------------------------------------------------
  -- 3. Configs + env vars follow the project (member-only)
  ------------------------------------------------------------------
  insert into public.project_configs (project_id, description, tags, branch, monitoring_status)
  values (v_proj_a, 'Checkout API', array['api'], 'main', 'active');

  -- non-secret value persists; secret persists as name + presence only
  insert into public.project_env_vars (project_id, key, value, is_secret, has_value)
  values (v_proj_a, 'DATABASE_HOST', 'db.internal', false, true);

  insert into public.project_env_vars (project_id, key, value, is_secret, has_value)
  values (v_proj_a, 'JWT_SECRET', null, true, true);

  if exists (select 1 from public.project_env_vars where project_id = v_proj_a and key = 'JWT_SECRET' and value is not null) then
    raise exception 'FAIL: secret value was persisted';
  end if;

  -- monitoring_status allowlist is enforced
  begin
    update public.project_configs set monitoring_status = 'live-hacked' where project_id = v_proj_a;
    raise exception 'FAIL: invalid monitoring_status was accepted';
  exception when check_violation then
    null; -- expected
  end;

  -- other user sees none of it
  perform set_config('request.jwt.claim.sub', v_other::text, false);

  select count(*) into v_seen from public.project_configs where project_id = v_proj_a;
  if v_seen <> 0 then
    raise exception 'FAIL: config leaked to another tenant';
  end if;

  select count(*) into v_seen from public.project_env_vars where project_id = v_proj_a;
  if v_seen <> 0 then
    raise exception 'FAIL: env vars leaked to another tenant';
  end if;

  -- other user cannot insert config into our project
  begin
    insert into public.project_configs (project_id, description)
    values (v_proj_a, 'Sneaky');
    raise exception 'FAIL: cross-tenant config insert was allowed';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- other user's own project works independently
  insert into public.organizations (name, created_by)
  values ('Onboard Co B', v_other) returning id into v_org_b;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_b, v_other, 'owner');

  insert into public.project_drafts (draft_id, organization_id, created_by)
  values ('draft-bbb', v_org_b, v_other);

  raise notice 'PASS: all onboarding RLS checks succeeded';
end
$$;

reset role;
