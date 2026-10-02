-- Phase 1 core platform state (per Architecture.md §18-19).
-- Postgres stores platform metadata only (never high-volume telemetry).
-- Auth users live in auth.users; public.profiles extends them.

-- Profiles: one row per authenticated user.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Organizations: top-level tenant grouping.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Organization members: who can access an org.
create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Projects: monitored project inside an organization.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;

-- Profiles: user reads/updates own row.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Organizations: visible to members.
create policy "organizations_select_member"
  on public.organizations for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
    )
  );

create policy "organizations_insert_authenticated"
  on public.organizations for insert
  to authenticated
  with check (true);

-- Members: user sees own memberships; org owners/admins see all in their org.
create policy "members_select_own_or_org_admin"
  on public.organization_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_members admin
      where admin.organization_id = organization_members.organization_id
        and admin.user_id = auth.uid()
        and admin.role in ('owner', 'admin')
    )
  );

-- Projects: visible to org members.
create policy "projects_select_org_member"
  on public.projects for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = projects.organization_id
        and m.user_id = auth.uid()
    )
  );

create policy "projects_insert_org_member"
  on public.projects for insert
  to authenticated
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = projects.organization_id
        and m.user_id = auth.uid()
    )
  );
