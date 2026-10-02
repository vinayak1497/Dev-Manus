-- Minimal stand-in for the Supabase-managed `auth` schema.
-- Only exists so the Phase 1 migrations can be executed against a plain
-- Postgres during development. Never applied to a real project.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end
$$;

grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;

-- Supabase exposes the caller's uid from the JWT via auth.uid(). We read it
-- from a transaction-local setting so tests can impersonate a user.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant execute on function auth.uid() to authenticated, anon;
