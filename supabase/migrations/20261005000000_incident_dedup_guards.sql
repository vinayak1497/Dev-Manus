-- Incident deduplication guards: enforce at the database level what the
-- detector already intends at the application level.
--
-- 1. At most one ACTIVE (non-resolved) incident per service. The detector
--    (`lib/detection/monitor.ts` -> `activeIncidentFor` -> `reconcileService`
--    -> `record_ongoing`) deduplicates by reading first and writing second;
--    two concurrent ticks could both read "no active incident" and both
--    insert. This partial unique index makes the second insert fail with
--    code 23505, which the application handles as normal deduplication
--    (it keeps the existing incident and finishes the pass successfully).
-- 2. At most one RUNNING verification run per incident, for the same
--    read-then-write reason (`runningVerificationFor` -> `begin_verification`).
--
-- BACKFILL (run BEFORE applying if either query returns rows). Do not apply
-- this migration while duplicates exist — CREATE UNIQUE INDEX fails closed:
--
--   -- duplicate active incidents per service:
--   select service_id, count(*)
--     from public.incidents
--    where status <> 'resolved' and service_id is not null
--    group by service_id having count(*) > 1;
--   -- duplicate running verifications per incident:
--   select incident_id, count(*)
--     from public.verification_runs
--    where status = 'running'
--    group by incident_id having count(*) > 1;
--
-- For each duplicate set, keep the newest row (by detected_at / started_at)
-- and move the older ones out of the guarded state: incidents to 'resolved'
-- with a note event ("closed as duplicate of <kept id>"), older running
-- verification runs to 'cancelled'. Historical resolved rows are untouched
-- by these indexes and need no migration.
--
-- Deploy order: database first (`supabase db push`), then web + worker builds
-- that contain the 23505-as-dedup handling. The application tolerates the
-- indexes being absent (previous behaviour), and tolerates them being present
-- without the handling (a conflicting insert returns no row, which the tick
-- already treats as created:0 — the handling only makes the intent explicit).

create unique index if not exists incidents_one_active_per_service
  on public.incidents (service_id)
  where status <> 'resolved' and service_id is not null;

create unique index if not exists verification_runs_one_running_per_incident
  on public.verification_runs (incident_id)
  where status = 'running';
