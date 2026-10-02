# Backend — Go control plane (foundation stub)

Per `Docs/Architecture.md` §20–21: modular monolith in Go, starting as a
single `monitoring-api` service. Full modules (`api`, `auth`, `projects`,
`monitors`, `incidents`, `detection`, `correlation`, `integrations`,
`notifications`, `kubernetes`, `security`, `ai`, `telemetry`, `database`)
are added incrementally in Phase 1+.

## Current state

- `cmd/api/main.go` — minimal HTTP server with `GET /healthz`.
- No database, auth, or business logic yet (future work).

## Requirements

- Go >= 1.23 (not required for the Landing Page; frontend is Next.js).

## Run (once Go is installed)

```sh
PORT=8080 go run ./cmd/api
curl http://localhost:8080/healthz
```
