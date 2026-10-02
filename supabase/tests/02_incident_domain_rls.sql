-- Verifies Phase 2 (incident-domain) RLS: services, incidents, and their
-- child tables — plus the Phase 2b detection/verification tables
-- (service_health_checks, verification_runs) — are readable/writable only by
-- members of the owning project's organization, enforced entirely by the
-- can_access_project / can_access_incident SECURITY DEFINER helpers, never by
-- app code. It also asserts the remediation action_type allowlist is enforced
-- in the database (§15: no EXECUTE_ARBITRARY_COMMAND).
--
-- Run as a superuser (to seed auth.users) but the assertions run under
-- `set role authenticated`, otherwise the table owner would bypass RLS and
-- every isolation check would pass vacuously.
--
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f 02_incident_domain_rls.sql

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
  v_user       constant uuid := '11111111-1111-1111-1111-111111111111';
  v_other      constant uuid := '22222222-2222-2222-2222-222222222222';
  v_org_a      uuid;
  v_proj_a     uuid;
  v_svc_a      uuid;
  v_incident_a uuid;
  v_ai_a       uuid;
  v_org_b      uuid;
  v_proj_b     uuid;
  v_incident_b uuid;
  v_remed_a    uuid;
  v_hc_a       uuid;
  v_vrun_a     uuid;
  v_seen       int;
begin
  ------------------------------------------------------------------
  -- 1. User A builds a project with a full incident record
  ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user::text, false);

  insert into public.organizations (name, created_by)
  values ('Incident Co A', v_user) returning id into v_org_a;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_a, v_user, 'owner');

  insert into public.projects (organization_id, name, slug, created_by)
  values (v_org_a, 'Checkout', 'checkout-a', v_user) returning id into v_proj_a;

  insert into public.services (project_id, name, status)
  values (v_proj_a, 'api', 'critical') returning id into v_svc_a;

  insert into public.incidents (project_id, service_id, title, severity, status, created_by)
  values (v_proj_a, v_svc_a, 'API 5xx spike', 'high', 'investigating', v_user)
  returning id into v_incident_a;

  insert into public.incident_events (incident_id, kind, message, actor)
  values (v_incident_a, 'detected', 'Error rate crossed threshold', 'system');

  insert into public.incident_evidence (incident_id, source, label, detail)
  values (v_incident_a, 'metric', 'http_5xx_rate', '12% over 5m');

  insert into public.ai_analyses (incident_id, observation, interpretation, confidence)
  values (v_incident_a, 'Elevated 5xx after deploy', 'Likely bad release', 'medium')
  returning id into v_ai_a;

  insert into public.remediation_actions (incident_id, ai_analysis_id, title, proposed_by, action_type)
  values (v_incident_a, v_ai_a, 'Roll back to previous release', 'ai', 'ROLLBACK_DEMO_DEPLOYMENT')
  returning id into v_remed_a;

  -- Observed health signal + a post-remediation verification run (Phase 2b).
  -- The simulation writes an UNHEALTHY check; it never creates an incident.
  insert into public.service_health_checks (project_id, service_id, status, source, is_demo)
  values (v_proj_a, v_svc_a, 'critical', 'simulation', true)
  returning id into v_hc_a;

  insert into public.verification_runs (incident_id, remediation_action_id, status)
  values (v_incident_a, v_remed_a, 'running')
  returning id into v_vrun_a;

  -- Owner can read every row back through the access helpers.
  if not exists (select 1 from public.services where id = v_svc_a)
     or not exists (select 1 from public.incidents where id = v_incident_a)
     or not exists (select 1 from public.incident_events where incident_id = v_incident_a)
     or not exists (select 1 from public.incident_evidence where incident_id = v_incident_a)
     or not exists (select 1 from public.ai_analyses where id = v_ai_a)
     or not exists (select 1 from public.remediation_actions where incident_id = v_incident_a)
     or not exists (select 1 from public.service_health_checks where id = v_hc_a)
     or not exists (select 1 from public.verification_runs where id = v_vrun_a)
  then
    raise exception 'FAIL: owner cannot read back their own incident record';
  end if;

  -- Remediation defaults must protect the human-approval gate.
  if (select requires_approval from public.remediation_actions
        where incident_id = v_incident_a limit 1) is not true then
    raise exception 'FAIL: remediation requires_approval did not default true';
  end if;
  if (select status from public.remediation_actions
        where incident_id = v_incident_a limit 1) <> 'proposed' then
    raise exception 'FAIL: remediation did not default to proposed';
  end if;

  -- Recovery is only confirmed by N consecutive healthy checks (§17/§10): a
  -- fresh run defaults to 'running', needs >= 1 check, and starts at 0 passed.
  if (select status from public.verification_runs where id = v_vrun_a) <> 'running' then
    raise exception 'FAIL: verification run did not default to running';
  end if;
  if (select checks_required from public.verification_runs where id = v_vrun_a) < 1 then
    raise exception 'FAIL: verification checks_required must be >= 1';
  end if;
  if (select checks_passed from public.verification_runs where id = v_vrun_a) <> 0 then
    raise exception 'FAIL: verification checks_passed did not default to 0';
  end if;

  ------------------------------------------------------------------
  -- 2. CHECK constraints reject values outside the allowed sets
  ------------------------------------------------------------------
  begin
    insert into public.services (project_id, name, status)
    values (v_proj_a, 'bad', 'on-fire');
    raise exception 'FAIL: invalid service status was accepted';
  exception when check_violation then null; -- expected
  end;

  begin
    insert into public.incidents (project_id, title, severity)
    values (v_proj_a, 'bad', 'sev-zero');
    raise exception 'FAIL: invalid incident severity was accepted';
  exception when check_violation then null; -- expected
  end;

  -- The remediation allowlist is enforced in the DATABASE, not only in app
  -- code: there is deliberately no arbitrary-command action type (§15 — the
  -- engine must never be able to persist EXECUTE_ARBITRARY_COMMAND).
  begin
    update public.remediation_actions
       set action_type = 'EXECUTE_ARBITRARY_COMMAND' where id = v_remed_a;
    raise exception 'FAIL: arbitrary-command action_type was accepted';
  exception when check_violation then null; -- expected
  end;

  begin
    insert into public.service_health_checks (project_id, service_id, status)
    values (v_proj_a, v_svc_a, 'on-fire');
    raise exception 'FAIL: invalid health-check status was accepted';
  exception when check_violation then null; -- expected
  end;

  begin
    insert into public.verification_runs (incident_id, status)
    values (v_incident_a, 'sorta-passed');
    raise exception 'FAIL: invalid verification status was accepted';
  exception when check_violation then null; -- expected
  end;

  ------------------------------------------------------------------
  -- 3. Tenant isolation: another user sees none of A's rows
  ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_other::text, false);

  select count(*) into v_seen from public.services;
  if v_seen <> 0 then
    raise exception 'FAIL: service isolation broken, other user sees % rows', v_seen;
  end if;

  select count(*) into v_seen from public.incidents;
  if v_seen <> 0 then
    raise exception 'FAIL: incident isolation broken, other user sees % rows', v_seen;
  end if;

  select count(*) into v_seen from public.incident_events;
  if v_seen <> 0 then
    raise exception 'FAIL: incident_events isolation broken (% rows)', v_seen;
  end if;

  select count(*) into v_seen from public.incident_evidence;
  if v_seen <> 0 then
    raise exception 'FAIL: incident_evidence isolation broken (% rows)', v_seen;
  end if;

  select count(*) into v_seen from public.ai_analyses;
  if v_seen <> 0 then
    raise exception 'FAIL: ai_analyses isolation broken (% rows)', v_seen;
  end if;

  select count(*) into v_seen from public.remediation_actions;
  if v_seen <> 0 then
    raise exception 'FAIL: remediation isolation broken (% rows)', v_seen;
  end if;

  select count(*) into v_seen from public.service_health_checks;
  if v_seen <> 0 then
    raise exception 'FAIL: service_health_checks isolation broken (% rows)', v_seen;
  end if;

  select count(*) into v_seen from public.verification_runs;
  if v_seen <> 0 then
    raise exception 'FAIL: verification_runs isolation broken (% rows)', v_seen;
  end if;

  ------------------------------------------------------------------
  -- 4. B has their own project + incident, but cannot touch A's
  ------------------------------------------------------------------
  insert into public.organizations (name, created_by)
  values ('Incident Co B', v_other) returning id into v_org_b;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_b, v_other, 'owner');

  insert into public.projects (organization_id, name, slug, created_by)
  values (v_org_b, 'Billing', 'billing-b', v_other) returning id into v_proj_b;

  insert into public.incidents (project_id, title, created_by)
  values (v_proj_b, 'B owns this', v_other) returning id into v_incident_b;

  -- may NOT add a service to A's project
  begin
    insert into public.services (project_id, name) values (v_proj_a, 'sneaky');
    raise exception 'FAIL: cross-tenant service insert was allowed';
  exception when insufficient_privilege then null; -- expected
  end;

  -- may NOT open an incident on A's project
  begin
    insert into public.incidents (project_id, title) values (v_proj_a, 'sneaky');
    raise exception 'FAIL: cross-tenant incident insert was allowed';
  exception when insufficient_privilege then null; -- expected
  end;

  -- may NOT attach an event to A's incident (can_access_incident = false)
  begin
    insert into public.incident_events (incident_id, message)
    values (v_incident_a, 'sneaky');
    raise exception 'FAIL: cross-tenant incident_event insert was allowed';
  exception when insufficient_privilege then null; -- expected
  end;

  -- may NOT update A's incident (row is invisible → no rows match)
  begin
    update public.incidents set title = 'Hacked' where id = v_incident_a;
    if found then
      raise exception 'FAIL: cross-tenant incident update was allowed';
    end if;
  exception when insufficient_privilege then null; -- expected
  end;

  -- may NOT record a health check against A's project
  begin
    insert into public.service_health_checks (project_id, service_id, status)
    values (v_proj_a, v_svc_a, 'critical');
    raise exception 'FAIL: cross-tenant health-check insert was allowed';
  exception when insufficient_privilege then null; -- expected
  end;

  -- may NOT open a verification run on A's incident
  begin
    insert into public.verification_runs (incident_id, status)
    values (v_incident_a, 'running');
    raise exception 'FAIL: cross-tenant verification insert was allowed';
  exception when insufficient_privilege then null; -- expected
  end;

  ------------------------------------------------------------------
  -- 5. Cleanup — each owner deletes only their own project (cascades)
  ------------------------------------------------------------------
  delete from public.projects where id = v_proj_b;

  perform set_config('request.jwt.claim.sub', v_user::text, false);
  delete from public.projects where id = v_proj_a;

  if exists (select 1 from public.incidents where id = v_incident_a) then
    raise exception 'FAIL: deleting the project did not cascade its incidents';
  end if;

  raise notice 'PASS: all Phase 2 incident-domain RLS checks succeeded';
end
$$;

reset role;
