#!/usr/bin/env bash
# Applies every migration in order against a throwaway Postgres and runs the
# RLS / telemetry assertions (Phase 1 core + Phase 2 incident domain + Phase 2b
# detection/verification). Requires a running Docker daemon. The container is
# created on demand and destroyed on exit; nothing here touches a real Supabase
# project. Bash companion to run.ps1 (identical coverage).
#
#   bash supabase/tests/run.sh
set -uo pipefail

CONTAINER="safeguard-rlstest"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

run_file() {
  local path="$1"
  [ -f "$path" ] || { echo "missing file: $path" >&2; return 1; }
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < "$path"
}
run_sql() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres <<<"$1"
}

echo "==> starting throwaway postgres"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres postgres:17-alpine >/dev/null

ready=0
for _ in $(seq 1 40); do
  sleep 2
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then ready=1; break; fi
done
[ "$ready" -eq 1 ] || { echo "postgres never became ready"; exit 1; }

echo "==> applying migrations in order"
run_sql "drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;" || exit 1

# __RUN_SH_TAIL__
FILES=(
  "tests/00_auth_stub.sql"
  "migrations/20260928000000_phase1_core.sql"
  "migrations/20260929000000_profile_trigger.sql"
  "migrations/20260930000000_project_telemetry_and_rls_fix.sql"
  "migrations/20261001000000_incident_domain.sql"
  "migrations/20261002000000_detection_and_verification.sql"
  "migrations/20261003000000_project_onboarding.sql"
  "migrations/20261004000000_automatic_monitoring.sql"
  "migrations/20261005000000_incident_dedup_guards.sql"
)
for f in "${FILES[@]}"; do
  run_file "$ROOT/$f" || { echo "==> FAILED applying $f"; exit 1; }
  echo "    applied  $f"
done

echo "==> granting privileges to the authenticated role"
run_sql "grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;" || exit 1

echo "==> running assertions as the authenticated role"
run_file "$ROOT/tests/01_rls_and_telemetry.sql" || { echo "==> FAILED (phase 1)"; exit 1; }
run_file "$ROOT/tests/02_incident_domain_rls.sql" || { echo "==> FAILED (phase 2)"; exit 1; }
run_file "$ROOT/tests/03_onboarding_rls.sql" || { echo "==> FAILED (onboarding)"; exit 1; }
run_file "$ROOT/tests/04_automatic_monitoring.sql" || { echo "==> FAILED (automatic monitoring)"; exit 1; }
run_file "$ROOT/tests/05_dedup_guards.sql" || { echo "==> FAILED (dedup guards)"; exit 1; }

echo ""
echo "==> PASSED - migrations apply cleanly and RLS behaves correctly"
