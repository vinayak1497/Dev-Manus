# Runs the Phase 1 migrations against a throwaway Postgres and executes the
# RLS / telemetry checks. Requires a running Docker daemon.
#
#   powershell -ExecutionPolicy Bypass -File supabase\tests\run.ps1
#
# The container is created on demand and destroyed afterwards. Nothing here
# touches a real Supabase project.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
# and mangles UTF-8 punctuation, which breaks parsing.

$ErrorActionPreference = "Continue"   # psql NOTICE on stderr is not fatal
$container = "safeguard-migratest"
$port = 55432
$root = Split-Path -Parent $PSScriptRoot

function Invoke-Psql {
  param(
    [string]$Sql,
    [string]$Path
  )
  if (-not $Sql -and -not $Path) { throw "Invoke-Psql needs -Sql or -Path" }
  $label = if ($Path) { Split-Path -Leaf $Path } else { "inline sql" }

  if ($Path) {
    if (-not (Test-Path -LiteralPath $Path)) { throw ("missing file: " + $Path) }
    $input_ = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  }
  else {
    $input_ = $Sql
  }

  $out = $input_ | docker exec -i $container psql -q -U postgres -d postgres 2>&1 |
         ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { $_ } }
  if ($LASTEXITCODE -ne 0) {
    $clean = ($out | Where-Object { $_ -notmatch "NOTICE" -and ("$_").Trim() -ne "" }) -join [Environment]::NewLine
    throw ("psql failed for " + $label + ":" + [Environment]::NewLine + $clean)
  }
}

Write-Host "==> starting throwaway postgres" -ForegroundColor Cyan
docker rm -f $container 2>$null | Out-Null
docker run -d --name $container -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres -p "${port}:5432" postgres:17-alpine | Out-Null

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 2
  docker exec $container pg_isready -U postgres 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
}
if (-not $ready) { Write-Host "postgres never became ready" -ForegroundColor Red; exit 1 }

try {
  Write-Host "==> applying migrations in order" -ForegroundColor Cyan
  Invoke-Psql -Sql "drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;"

  $files = @(
    "tests\00_auth_stub.sql",
    "migrations\20260928000000_phase1_core.sql",
    "migrations\20260929000000_profile_trigger.sql",
    "migrations\20260930000000_project_telemetry_and_rls_fix.sql",
    "migrations\20261001000000_incident_domain.sql",
    "migrations\20261002000000_detection_and_verification.sql",
    "migrations\20261003000000_project_onboarding.sql"
  )
  foreach ($f in $files) {
    Invoke-Psql -Path (Join-Path $root $f)
    Write-Host ("    applied  " + $f)
  }

  Write-Host "==> granting privileges to the authenticated role" -ForegroundColor Cyan
  Invoke-Psql -Sql "grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;"

  Write-Host "==> running assertions as the authenticated role" -ForegroundColor Cyan
  Invoke-Psql -Path (Join-Path $root "tests\01_rls_and_telemetry.sql")
  Invoke-Psql -Path (Join-Path $root "tests\02_incident_domain_rls.sql")
  Invoke-Psql -Path (Join-Path $root "tests\03_onboarding_rls.sql")
  Write-Host ""
  Write-Host "==> PASSED - migrations apply cleanly and RLS behaves correctly" -ForegroundColor Green
  exit 0
}
catch {
  Write-Host ""
  Write-Host "==> FAILED" -ForegroundColor Red
  Write-Host $_.Exception.Message
  exit 1
}
finally {
  docker rm -f $container 2>$null | Out-Null
}
