-- Phase 1b: project telemetry columns + workable RLS for self-serve onboarding.
--
-- Pairs with 20260928000000_phase1_core.sql. Two things are corrected here:
--
--  1. RLS could not be satisfied by any real user flow.
--     - `organization_members` had no INSERT policy, so a signed-up user
--       could never become a member, which in turn blocked
--       `projects_insert_org_member` forever.
--     - `members_select_own_or_org_admin` queries `organization_members`
--       from inside a policy on `organization_members`, and
--       `organizations_select_member` / `projects_select_org_member`
--       query `organization_members` from policies on other tables.
--       Postgres raises "infinite recursion detected in policy" for all
--       of these, so every read of organizations/projects would 500.
--     Fixed with SECURITY DEFINER helper functions that bypass RLS and
--     always scope to `auth.uid()`.
--
--  2. `public.projects` had no operational columns, so the Projects Home
--     could only ever render "Unknown". These back the columns the page
--     already reads. `is_demo` marks sample rows so the UI can label them
--     (RULE.md §9.1 - mock data must be identifiable as such).

-- ---------------------------------------------------------------------------
-- 1. RLS helper functions
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER runs as the table owner, so it is not subject to the
-- calling role's RLS (that is what breaks the recursion). Both helpers
-- scope strictly to `auth.uid()`, so they can safely be executable by
-- PUBLIC - they only ever reveal the caller's own membership.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_admin_role(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_admin_role(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_admin_role(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Replace the recursive policies
-- ---------------------------------------------------------------------------

-- The creator must always be able to read their own organization.
-- Without this, `INSERT ... RETURNING id` (and any read-back of the row)
-- is filtered by the SELECT policy before the owner membership exists,
-- which makes self-serve onboarding impossible.
drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
  on public.organizations for select
  to authenticated
  using (created_by = auth.uid() or public.is_org_member(id));

drop policy if exists "members_select_own_or_org_admin"
  on public.organization_members;
create policy "members_select_own_or_org_admin"
  on public.organization_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_org_admin_role(organization_id)
  );

-- Self-serve onboarding: a user may enrol themselves in an organization
-- they created. Scoping on `organizations.created_by = auth.uid()` stops
-- anyone joining somebody else's organization.
drop policy if exists "members_insert_self_into_own_org"
  on public.organization_members;
create policy "members_insert_self_into_own_org"
  on public.organization_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organizations o
      where o.id = organization_members.organization_id
        and o.created_by = auth.uid()
    )
  );

drop policy if exists "projects_select_org_member" on public.projects;
create policy "projects_select_org_member"
  on public.projects for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "projects_insert_org_member" on public.projects;
create policy "projects_insert_org_member"
  on public.projects for insert
  to authenticated
  with check (public.is_org_member(organization_id));

-- Without an UPDATE policy every update silently affects zero rows, which
-- reads as "the save worked" from the client. The WITH CHECK also stops a
-- project being moved into an organization the caller does not belong to.
drop policy if exists "projects_update_org_member" on public.projects;
create policy "projects_update_org_member"
  on public.projects for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- Demo seeding needs to remove its own rows again.
drop policy if exists "projects_delete_org_member" on public.projects;
create policy "projects_delete_org_member"
  on public.projects for delete
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "organizations_update_admin" on public.organizations;
create policy "organizations_update_admin"
  on public.organizations for update
  to authenticated
  using (public.has_org_admin_role(id))
  with check (public.has_org_admin_role(id));

-- ---------------------------------------------------------------------------
-- 3. Project telemetry columns
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists environment text,
  add column if not exists repository text,
  add column if not exists health text
    constraint projects_health_check
    check (health is null or health in (
      'healthy', 'warning', 'critical', 'unknown', 'maintenance', 'recovering'
    )),
  add column if not exists service_count integer
    constraint projects_service_count_check
    check (service_count is null or service_count >= 0),
  add column if not exists active_incident_count integer
    constraint projects_active_incident_count_check
    check (active_incident_count is null or active_incident_count >= 0),
  add column if not exists last_checked_at timestamptz,
  add column if not exists health_warning text,
  add column if not exists deployment_version text,
  add column if not exists deployment_commit text,
  add column if not exists deployment_status text
    constraint projects_deployment_status_check
    check (deployment_status is null or deployment_status in (
      'success', 'failed', 'running', 'unknown'
    )),
  add column if not exists deployed_at timestamptz,
  add column if not exists is_demo boolean not null default false;

-- Projects Home reads newest-first within an organization.
create index if not exists projects_organization_created_idx
  on public.projects (organization_id, created_at desc);
