-- Phase 3: project onboarding — draft wizard state + final config.
--
-- The Add Project wizard (Screen_Navigation.md §7) is ONE journey, not ten
-- unrelated screens. While incomplete it lives in `project_drafts` (no
-- `projects` row is created, so navigation can never duplicate projects).
-- Review → Start Monitoring creates exactly ONE `projects` row (idempotent
-- on `draftId`) and writes the full configuration to `project_configs` +
-- `project_env_vars`.
--
-- Secrets: only NAMES + presence are persisted (`project_env_vars` with
-- `is_secret = true` stores no value). Secret values travel in memory only
-- and are never logged, never committed, never returned by SELECT policies
-- beyond presence (RULE.md §11).
--
-- Tenant isolation follows the proven helpers: drafts are owned by their
-- creator; configs/env vars are reached through can_access_project().

-- ---------------------------------------------------------------------------
-- 1. Drafts — incomplete wizard state, owned by the creator
-- ---------------------------------------------------------------------------

create table public.project_drafts (
  id uuid primary key default gen_random_uuid(),
  -- Idempotency key generated client-side per wizard. Review → create is
  -- idempotent on this value so double-submit/refresh creates one project.
  draft_id text not null unique,
  organization_id uuid references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  current_step text not null default 'basics',
  status text not null default 'draft'
    constraint project_drafts_status_check
    check (status in ('draft', 'creating', 'created', 'abandoned')),
  wizard_state jsonb not null default '{}'::jsonb,
  created_project_id uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_drafts enable row level security;

-- Owner-only: a draft is private to its creator until it becomes a project
-- (which is org-scoped). This keeps incomplete wizards out of other members'
-- views and survives refresh/navigation per user.
create policy "project_drafts_owner_all" on public.project_drafts
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create index project_drafts_owner_updated_idx
  on public.project_drafts (created_by, updated_at desc);
create index project_drafts_created_project_idx
  on public.project_drafts (created_project_id);

-- ---------------------------------------------------------------------------
-- 2. Final onboarding configuration — one row per project
-- ---------------------------------------------------------------------------

create table public.project_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  description text,
  tags text[] not null default '{}',
  branch text,
  repository_provider text,
  analysis jsonb,
  deployment jsonb,
  runtime jsonb,
  dependencies jsonb,
  health jsonb,
  monitoring_status text not null default 'pending'
    constraint project_configs_monitoring_check
    check (monitoring_status in ('pending', 'active', 'degraded', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_configs enable row level security;

create policy "project_configs_select" on public.project_configs
  for select to authenticated using (public.can_access_project(project_id));
create policy "project_configs_insert" on public.project_configs
  for insert to authenticated with check (public.can_access_project(project_id));
create policy "project_configs_update" on public.project_configs
  for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));
create policy "project_configs_delete" on public.project_configs
  for delete to authenticated using (public.can_access_project(project_id));

-- ---------------------------------------------------------------------------
-- 3. Environment entries — non-secret values + secret names only
-- ---------------------------------------------------------------------------

create table public.project_env_vars (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null,
  -- NULL when is_secret (we persist presence, never the value).
  value text,
  is_secret boolean not null default false,
  has_value boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);

alter table public.project_env_vars enable row level security;

create policy "project_env_vars_select" on public.project_env_vars
  for select to authenticated using (public.can_access_project(project_id));
create policy "project_env_vars_insert" on public.project_env_vars
  for insert to authenticated with check (public.can_access_project(project_id));
create policy "project_env_vars_update" on public.project_env_vars
  for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));
create policy "project_env_vars_delete" on public.project_env_vars
  for delete to authenticated using (public.can_access_project(project_id));

create index project_env_vars_project_idx
  on public.project_env_vars (project_id);
