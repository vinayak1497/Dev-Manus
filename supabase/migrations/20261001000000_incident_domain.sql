-- Phase 2: operational domain — services, incidents, evidence, AI analysis,
-- and human-gated remediation (Screen_Navigation.md §7-§12, acceptance §107).
--
-- Postgres holds platform + incident-lifecycle state only, never high-volume
-- telemetry (Architecture.md §18). Every table is project-scoped and protected
-- by the same SECURITY DEFINER membership helpers proven in
-- 20260930000000_project_telemetry_and_rls_fix.sql, so tenant isolation is
-- enforced by RLS — not by application code.
--
-- Data-integrity (RULE.md §9): demo rows carry is_demo = true so the UI labels
-- them. AI output is never stored or shown as fact — it carries an explicit
-- confidence level and disclaimer and is read-only; only a human can approve a
-- remediation (§AI safety / §remediation-approval).

-- ---------------------------------------------------------------------------
-- 1. Project-scoped access helper (builds on is_org_member)
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER bypasses the caller's RLS (avoids recursion) and always
-- resolves membership through auth.uid(), so it only ever reveals rows the
-- caller may already see. search_path = '' forces every reference to be
-- schema-qualified.
create or replace function public.can_access_project(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = target_project
      and public.is_org_member(p.organization_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Domain tables
-- ---------------------------------------------------------------------------

-- A monitored service inside a project. status is null until a real source
-- reports it (renders as "Unknown", never assumed healthy — RULE.md §9.2).
create table public.services (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  kind text,
  status text
    constraint services_status_check
    check (status is null or status in (
      'healthy', 'warning', 'critical', 'unknown', 'maintenance', 'recovering'
    )),
  description text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

-- An incident on a project. Lifecycle: open → investigating → identified →
-- monitoring → resolved. Severity and status are constrained, never free text.
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  title text not null,
  summary text,
  severity text not null default 'medium'
    constraint incidents_severity_check
    check (severity in ('critical', 'high', 'medium', 'low')),
  status text not null default 'open'
    constraint incidents_status_check
    check (status in (
      'open', 'investigating', 'identified', 'monitoring', 'resolved'
    )),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  is_demo boolean not null default false
);

-- Ordered timeline of what happened on an incident (Observation → … →
-- Resolved). actor records whether a human, the system, or the AI acted.
create table public.incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null default 'note'
    constraint incident_events_kind_check
    check (kind in (
      'detected', 'evidence', 'ai_analysis', 'remediation_proposed',
      'remediation_approved', 'remediation_rejected', 'remediation_applied',
      'verification', 'resolved', 'note'
    )),
  message text not null,
  actor text not null default 'system'
    constraint incident_events_actor_check
    check (actor in ('system', 'ai', 'user')),
  metadata jsonb,
  is_demo boolean not null default false
);

-- Concrete evidence attached to an incident (a metric reading, a log line, a
-- deployment marker). This is the "Evidence" the UI shows before any
-- interpretation, so a reader can judge the AI's reasoning for themselves.
create table public.incident_evidence (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  source text not null default 'event'
    constraint incident_evidence_source_check
    check (source in ('metric', 'log', 'trace', 'deployment', 'event', 'config')),
  label text not null,
  detail text,
  observed_at timestamptz,
  metadata jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- AI interpretation of an incident. Read-only and advisory: it is stored with
-- an explicit confidence level and a standing disclaimer, and it can never
-- itself change an incident or apply a fix (§AI safety). Structured fields back
-- the Observation → Interpretation → Confidence → Suggested action layout;
-- `raw` keeps the full validated model payload for audit.
create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  provider text,
  model text,
  observation text not null,
  interpretation text not null,
  confidence text not null default 'low'
    constraint ai_analyses_confidence_check
    check (confidence in ('low', 'medium', 'high')),
  confidence_rationale text,
  suggested_action text,
  evidence_refs jsonb,
  disclaimer text not null default
    'AI-generated interpretation — not verified fact. Review the evidence before acting.',
  raw jsonb,
  created_by uuid references auth.users (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- A remediation the AI (or a human) proposes. AI is read-only, so a proposed
-- action does NOTHING until a human approves it: requires_approval defaults
-- true and the status machine is proposed → approved → applied → verified
-- (or rejected/failed). approved_by/at record who authorised it.
create table public.remediation_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  ai_analysis_id uuid references public.ai_analyses (id) on delete set null,
  title text not null,
  description text,
  proposed_by text not null default 'ai'
    constraint remediation_proposed_by_check
    check (proposed_by in ('ai', 'user', 'system')),
  command text,
  risk text not null default 'medium'
    constraint remediation_risk_check
    check (risk in ('low', 'medium', 'high')),
  status text not null default 'proposed'
    constraint remediation_status_check
    check (status in (
      'proposed', 'approved', 'rejected', 'applied', 'verified', 'failed'
    )),
  requires_approval boolean not null default true,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  applied_at timestamptz,
  verified_at timestamptz,
  result text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Incident-scoped access helper (needs public.incidents to exist first)
-- ---------------------------------------------------------------------------

create or replace function public.can_access_incident(target_incident uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.incidents i
    where i.id = target_incident
      and public.can_access_project(i.project_id)
  );
$$;

revoke all on function public.can_access_project(uuid) from public;
revoke all on function public.can_access_incident(uuid) from public;
grant execute on function public.can_access_project(uuid) to authenticated;
grant execute on function public.can_access_incident(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security — every table scoped to the caller's memberships
-- ---------------------------------------------------------------------------

alter table public.services enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_events enable row level security;
alter table public.incident_evidence enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.remediation_actions enable row level security;

-- services + incidents are keyed directly on project_id.
create policy "services_select" on public.services for select
  to authenticated using (public.can_access_project(project_id));
create policy "services_insert" on public.services for insert
  to authenticated with check (public.can_access_project(project_id));
create policy "services_update" on public.services for update
  to authenticated using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));
create policy "services_delete" on public.services for delete
  to authenticated using (public.can_access_project(project_id));

create policy "incidents_select" on public.incidents for select
  to authenticated using (public.can_access_project(project_id));
create policy "incidents_insert" on public.incidents for insert
  to authenticated with check (public.can_access_project(project_id));
create policy "incidents_update" on public.incidents for update
  to authenticated using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));
create policy "incidents_delete" on public.incidents for delete
  to authenticated using (public.can_access_project(project_id));

-- Child tables are reached through their incident (can_access_incident).
create policy "incident_events_select" on public.incident_events for select
  to authenticated using (public.can_access_incident(incident_id));
create policy "incident_events_insert" on public.incident_events for insert
  to authenticated with check (public.can_access_incident(incident_id));
create policy "incident_events_update" on public.incident_events for update
  to authenticated using (public.can_access_incident(incident_id))
  with check (public.can_access_incident(incident_id));
create policy "incident_events_delete" on public.incident_events for delete
  to authenticated using (public.can_access_incident(incident_id));

create policy "incident_evidence_select" on public.incident_evidence for select
  to authenticated using (public.can_access_incident(incident_id));
create policy "incident_evidence_insert" on public.incident_evidence for insert
  to authenticated with check (public.can_access_incident(incident_id));
create policy "incident_evidence_update" on public.incident_evidence for update
  to authenticated using (public.can_access_incident(incident_id))
  with check (public.can_access_incident(incident_id));
create policy "incident_evidence_delete" on public.incident_evidence for delete
  to authenticated using (public.can_access_incident(incident_id));

create policy "ai_analyses_select" on public.ai_analyses for select
  to authenticated using (public.can_access_incident(incident_id));
create policy "ai_analyses_insert" on public.ai_analyses for insert
  to authenticated with check (public.can_access_incident(incident_id));
create policy "ai_analyses_update" on public.ai_analyses for update
  to authenticated using (public.can_access_incident(incident_id))
  with check (public.can_access_incident(incident_id));
create policy "ai_analyses_delete" on public.ai_analyses for delete
  to authenticated using (public.can_access_incident(incident_id));

create policy "remediation_select" on public.remediation_actions for select
  to authenticated using (public.can_access_incident(incident_id));
create policy "remediation_insert" on public.remediation_actions for insert
  to authenticated with check (public.can_access_incident(incident_id));
create policy "remediation_update" on public.remediation_actions for update
  to authenticated using (public.can_access_incident(incident_id))
  with check (public.can_access_incident(incident_id));
create policy "remediation_delete" on public.remediation_actions for delete
  to authenticated using (public.can_access_incident(incident_id));

-- ---------------------------------------------------------------------------
-- 5. Indexes for the read paths the UI actually uses
-- ---------------------------------------------------------------------------

create index services_project_idx on public.services (project_id);
create index incidents_project_detected_idx
  on public.incidents (project_id, detected_at desc);
create index incidents_project_status_idx
  on public.incidents (project_id, status);
create index incident_events_incident_at_idx
  on public.incident_events (incident_id, at);
create index incident_evidence_incident_idx
  on public.incident_evidence (incident_id);
create index ai_analyses_incident_created_idx
  on public.ai_analyses (incident_id, created_at desc);
create index remediation_incident_created_idx
  on public.remediation_actions (incident_id, created_at);
