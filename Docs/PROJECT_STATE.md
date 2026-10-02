# PROJECT_STATE.md — Persistent Working Memory

**Project:** Intelligent Application & Infrastructure Monitoring Platform
**Last Updated:** 2026-09-30
**Status:** Phase 2 operational workflow implemented and verified **locally** — full incident lifecycle (observe → detect → investigate → evidence → AI analysis → human approval → remediation → verification → resolve → report) wired end-to-end in code, RLS proven against a throwaway Postgres. Remote `supabase db push` is still the top blocker (linked project `afbuzhsnnczfawuwnglr` has no `public.*` tables).
**Source of truth for state:** This file. Read this before full repo analysis.

## 1. Current Implementation State

- **Phase:** Phase 1 (Foundation) partial — frontend foundation + Landing Page done; backend stub only.
- **Frontend:** Next.js 14.2.13 + React 18.3.1 + TypeScript 5.6.2 + Tailwind 3.4.13, App Router at `/`. `app/layout.tsx` (Inter + JetBrains Mono via next/font, metadata, skip-link), `app/page.tsx` (landing composition), `app/globals.css` (tokens, focus-visible, reduced-motion), `app/icon.svg` (favicon, fixes 404).
- **Design tokens:** `tailwind.config.ts` maps canonical palette (Brand `#155EEF`/`#1047C7`/`#E8F0FE`, Secondary `#0F766E`, canvas `#F8FAFC`, surface `#FFFFFF`, border `#CBD5E1`, ink `#0F172A`/`#475569`, success/warning/critical/info/ai + tints). No hardcoded hex in components — all via tokens.
- **Reusable UI:** `components/ui/` — `Button.tsx` (primary/secondary/ghost link-buttons), `Badge.tsx` (status never color-alone, icon+text), `Card.tsx`, `SectionHeading.tsx`, `icons.tsx` (inline SVG, no extra dep), `terminal.tsx` (reference `Terminal` + `AnimatedSpan` + `TypingAnimation` sequence system on `motion`: SequenceContext + ItemIndexContext, per-item viewport tracking, light-themed container).
- **Landing Page (`/`):** 12 sections faithful to `Stitch Designs/Landing Page/code.html`: `SiteHeader` (floating glass pill, in-page anchors), `Hero` (headline, CTAs, animated Safeguard terminal for ShopEasy), `TrustStrip`, `ProblemSection` (fragmented vs correlated), `HowItWorks` (7 steps), `ConsolePreview` (sidebar mock, KPI cards, incident table), `MonitoringGrid` (3×3), `FailureTimeline` (14:00–14:03 rail), `InfraTopology` (node/pod blocks), `SecuritySection` (pipeline), `AISection` (possible-cause card + evidence weights), `ArchitecturePillars` (Observe/Correlate/Explain), `FinalCTA` (`#get-started`), `SiteFooter`. All future-page links are in-page anchors — zero broken links by design.
- **Hero terminal:** `components/landing/HeroTerminal.tsx` drives the reference terminal with a compressed phased ShopEasy script (connect → analyze → monitor → anomaly → investigate → AI → protect → `SYSTEM SAFEGUARDED`), short lines, `mt-3` group breathing room. Apple-style window: 44px header, 10px muted traffic lights, `rounded-lg`, canvas-tinted body, 18–20px padding, 12–13px type (brand-medium commands, normal-weight semantic outputs, violet left-border AI block, calm final + subline), subtle blinking block cursor while typing.
- **Terminal viewport (overflow fix):** body is a real scroll viewport (`flex-col` card + `min-h-0 flex-1 overflow-y-auto` `pre`, `overflow-hidden` shell) with smooth auto-follow to the newest line (pauses if the visitor scrolls up, resumes at the bottom edge; instant when reduced-motion), slim `terminal-viewport` scrollbar (thin Firefox + 6px WebKit thumb in border token), and glyph/text rows fixed to inline flex (reference `grid` class was stacking each glyph above its text). Card keeps its fixed height; nothing spills past the border.
- **Deps added:** `motion` (terminal + auth animations), `clsx` + `tailwind-merge` (`lib/utils.ts` `cn`), `lucide-react` (password eye toggles).
- **Auth (`/login`, `/register`):** reference animated sign-in adapted to light theme in `components/ui/auth.tsx` (`Input` cursor-glow, `BoxReveal`, `Ripple`, `OrbitingCircles`, `TechOrbitDisplay`, `AnimatedForm` + additive `isSubmitting` disabled state, `Label`; our tokens, no remote images, static grid-cols, brand submit). `components/auth/AuthShell.tsx` split layout with orbiting stack chips (Docker/K8s/Prometheus/OTel/Postgres/GitHub) + inline Google SVG. Landing wired: Log in → `/login`, Add Your Project → `/register`. **Email + password auth via Supabase Auth** (`components/auth/AuthProvider.tsx` single listener: user/session/loading, `signUp`/`signIn`/`verifySignupCode`/`resendSignupCode`/`signOut`; `lib/supabase/auth-errors.ts` friendly errors, no raw internals): register (Name/Email/Password/Confirm, mismatch + already-registered handled) → 6-digit signup-code step (`components/auth/OtpVerifyForm.tsx`, same design language, 60s resend cooldown) → `/projects`; login sends no email, unconfirmed accounts auto-resend into the code step. Emailed links carry `emailRedirectTo` → `/auth/callback` route (code exchange + token_hash, fallback `/login`). New users auto-create `public.profiles` rows via `on_auth_user_created` trigger. Google button kept → honest "not configured" notice. `middleware.ts` + `lib/supabase/middleware.ts` refresh sessions and server-gate `/projects*` → `/login?next=`. Resend is SMTP-side only (no new dep); manual dashboard setup in `Docs/Auth-Resend-SMTP.md`. Tailwind `orbit`/`ripple` keyframes + `shadow-input`, `.g-button` CSS.
- **Projects Home (`/projects`):** full reference implementation of `Stitch Designs/User_Profile/code.html` (that file renders the Projects Home screen, not a user profile) — header + Refresh, health summary strip (real counts, click-to-filter), search with `/` shortcut, Filter popover (health state + environment) and Sort popover (recent/criticality/A-Z/services), active-filter tags with per-tag removal, grid/list view switcher, project cards (`components/projects/ProjectCard.tsx`), and a list table (`components/projects/ProjectTable.tsx`). Client interactivity lives in `components/projects/ProjectsView.tsx` (popovers close on outside-click + Escape, focus returns to trigger; `now`/`loadedAt` passed from the server so relative timestamps don't hydrate-drift). Server page (`app/projects/page.tsx`) reads real rows from `public.projects` via RLS (`id, name, slug, created_at`, `limit 200`, newest first), validates each row, and distinguishes **missing Supabase env** (config notice) from **unauthenticated** (`redirect("/login?next=/projects")`) from **query failure** (explicit error card — never swallowed). Domain model in `lib/projects.ts` (`ProjectSummary`, `HealthFilter`, six-state health model from Design.md §17, filter/sort/count helpers, `formatRelativeTime`/`formatAbsoluteTime` in UTC). `components/projects/ProjectHealth.tsx` provides the never-colour-alone badge/dot; `Badge` gained `unknown` (dashed, neutral — never green) and `maintenance` tones. `components/projects/RefreshProjectsButton.tsx` calls `router.refresh()` (labelled "Refresh", not "Sync Telemetry" — no telemetry pipeline exists yet). No new dependencies; `lucide-react` (already installed) used for icons, `TerminalIcon` reused from `components/ui/icons.tsx`.
- **Backend:** `backend/` stub only — `go.mod` (`safeguard/backend`, go 1.23), `cmd/api/main.go` (`GET /healthz`), `README.md`. Go toolchain NOT installed locally, so backend never built/run.
- **Config:** `package.json` (dev/build/start/lint/typecheck), `next.config.js`, `tsconfig.json`, `postcss.config.js`, `.eslintrc.json` (next/core-web-vitals), `opencode.json` (loads `Docs/RULE.md`), `.env.example` + `.env` (only `NEXT_PUBLIC_*` placeholders, no secrets), `.gitignore` (node_modules, .next, .env, supabase/.temp).
- **Supabase (CLI + client, linked project has no schema):** global CLI v2.118.0; `supabase/config.toml` (project_id `Major_Project`) + migrations `20260928000000_phase1_core.sql` (profiles/organizations/members/projects + RLS), `20260929000000_profile_trigger.sql`, `20260930000000_project_telemetry_and_rls_fix.sql` (telemetry columns + RLS repairs, see §2d); `supabase/tests/` (auth stub + RLS/telemetry assertions, run via `npm run test:db`). `@supabase/supabase-js` + `@supabase/ssr`; `lib/supabase/{client,server,middleware}.ts` + root `middleware.ts`. **Remote link and `db push` still pending** — the linked project `afbuzhsnnczfawuwnglr` has no `public.*` tables. A separate local stack named `SIH_Project` (courses/quizzes) is running on Docker and is **unrelated** — do not touch it.
- **Docs untouched:** `Architecture.md`, `Design.md`, `RULE.md`, `Screen_Navigation.md` not rewritten.

## 2. What Changed — 2026-09-30 (Phase 3: Add Project onboarding wizard)

The three-field dialog is replaced by a ten-step guided journey
(Screen_Navigation.md §7): Basics → Repository → Analysis → Deployment →
Environment → Runtime → Dependencies → Health → Review → Complete →
Dashboard. One `AddProjectWizard` state object drives a stepper, Back /
Continue, per-step validation, and refresh survival (localStorage draft;
secret VALUES session-only, never stored/logged/committed).
`POST /api/onboarding/analyze` inspects public GitHub repos over the public
API and returns ONLY observed findings (`detected` / `not_detected` /
`unavailable` via `ProvenanceBadge`); unreachable repos fall back to honest
manual configuration. Later steps adapt (runtime/deployment/dependency/health
suggestions) and never ask for what was detected. Review → Start Monitoring
calls `createProjectFromOnboarding()` which creates exactly ONE `projects`
row (idempotent on client `draftId`) and persists the configuration to new
`project_configs` + `project_env_vars` (secret NAMES + presence only, values
never persisted) — all anon-key/RLS-scoped. Setup Complete is honest
("Configuration saved · first check pending", health stays Unknown) with an
Open Dashboard CTA. Entry points: dialog (existing triggers) + full page
`/projects/new`. Migration `20261003000000_project_onboarding.sql` + RLS
harness `supabase/tests/03_onboarding_rls.sql`; unit tests
`tests/unit/onboarding-{validation,analyze}.test.ts`. Verified: `npm run
verify` clean, `npm run test:unit` 46/46, isolated production build
(`NEXT_BUILD_DIR=.next-verify`, dev server left running) includes
`/projects/new` + `/api/onboarding/analyze`. NOT yet verified: browser
walkthrough, `supabase db push` (remote still has no schema), Docker RLS
harness (daemon down here).

## 2-earlier. What Changed — 2026-09-30 (Phase 2: operational workflow)

The whole incident lifecycle from `Screen_Navigation.md` §7–§12 / acceptance
§107 now exists as real, project-scoped code — no fabricated telemetry, no fake
buttons, AI read-only and human-gated. **Verified locally only**; the remote DB
push is still pending (see §4).

**Database (two additive migrations, RLS-scoped like Phase 1):**

- `supabase/migrations/20261001000000_incident_domain.sql` — `services`,
  `incidents` (status open→investigating→identified→monitoring→resolved,
  severity critical/high/medium/low), `incident_events` (timeline; actor
  system/ai/user), `incident_evidence` (metric/log/trace/deployment/event/config),
  `ai_analyses` (observation/interpretation/confidence + disclaimer, read-only),
  `remediation_actions` (status machine proposed→approved→applied→verified /
  rejected/failed; `requires_approval` defaults **true**). Adds SECURITY DEFINER
  helpers `can_access_project()` / `can_access_incident()` and full
  select/insert/update/delete RLS on every table.
- `supabase/migrations/20261002000000_detection_and_verification.sql` —
  `service_health_checks` (the **observed** signal; `source` includes
  `'simulation'` for the controlled demo failure) and `verification_runs`
  (`checks_required` default 3, `checks_passed`). Adds a typed
  `remediation_actions.action_type` column with a DB-level CHECK allowlist
  (`RESTART_DEMO_SERVICE`/`RETRY_HEALTH_CHECK`/`ROLLBACK_DEMO_DEPLOYMENT`) — there
  is deliberately **no** arbitrary-command value, so the allowlist is enforced in
  the database, not only in app code.

**Domain + data-loading (`lib/`):**

- `lib/incidents.ts` — enums, narrowers (`toIncident`/`toService`/…),
  `deriveLifecyclePhase` (Detected/Investigating/Action Required/Remediating/
  Verifying/Resolved), `isActiveIncident`, label maps.
- `lib/incidents/load.ts` — `loadIncidentBundle()`, the single source of truth
  that assembles one incident (incident + project + service + events + evidence +
  related changes + AI analysis + remediations + verification runs + recent
  health checks + derived phase). Shared by the detail page, the report page, and
  the JSON export route so all three can never drift. Ownership is asserted
  (`project_id` must match) so a foreign/mismatched id returns not-found.

<!-- __PHASE2_BODY_2__ -->
**Detection (OBSERVE → DETECT, never BUTTON → INCIDENT):**

- `lib/detection/monitor.ts` — writes observed `service_health_checks`, including
  the labelled controlled-failure simulation. It records signals only; it never
  creates an incident.
- `lib/detection/reconcile.ts` — a separate pass reads recent checks and *decides*:
  opens an incident when a service is unhealthy, **deduplicates** against an
  already-open incident for the same service, and detects **recovery** only after
  N consecutive healthy checks. Pure/unit-tested (`tests/unit/reconcile.test.ts`).

**AI (read-only, hedged, never fabricates evidence):**

- `lib/ai/{index,types,schema,analyze-incident}.ts` — a provider abstraction with
  a **deterministic test provider** (used by tests and demo, no network/secret),
  structured output that is **validated** before use (`tests/unit/ai-schema.test.ts`,
  `deterministic-provider.test.ts`) and never rendered as raw JSON. Output is
  Observation → Evidence → Interpretation → Confidence → Suggested action, carries
  a standing disclaimer, and can only *suggest* — it never mutates an incident or
  applies a fix. It reasons only over supplied evidence.

**Remediation + verification (human-gated):**

- `lib/remediation/actions.ts` — the closed typed allowlist +
  `requireRemediationSpec()` which **fails closed** for anything off-list
  (`tests/unit/remediation-allowlist.test.ts`). No `EXECUTE_ARBITRARY_COMMAND`.
- `lib/remediation/engine.ts` — executes an approved action against demo
  services only, after a human approves; higher-risk actions need stronger
  confirmation. Nothing auto-executes because the AI recommended it.
- `verification_runs` — after a remediation is applied, recovery is confirmed by
  N consecutive healthy checks → `passed`/`failed`. An incident resolves only
  when remediation is applied **and** health recovered **and** verification passed.

**UI (colours by token, never colour-alone; violet #7C3AED reserved for AI):**

- `app/projects/[id]/page.tsx` — dashboard now has an Operations card
  (`OperationalControls`) and clickable incident rows linking into the detail page.
- `app/projects/[id]/incidents/[incidentId]/page.tsx` — incident detail: header,
  impact, timeline (from events), grouped evidence, related changes labelled
  "Occurred shortly before" (correlation, not proven cause), and a visually
  distinct violet AI-analysis panel.
- `app/projects/[id]/incidents/[incidentId]/report/page.tsx` — print-friendly
  report (real `window.print()`), observed facts kept separate from AI
  interpretation; **real** JSON export at `…/report/export/route.ts` (a route
  handler with `Content-Disposition`, not a fake download button).

**Tests / verification this round:**

- `npm run test:unit` → **31/31 pass** (ai-schema, deterministic-provider,
  reconcile, remediation-allowlist).
- `supabase/tests/02_incident_domain_rls.sql` extended to cover
  `service_health_checks` + `verification_runs` isolation, verification defaults,
  and the `action_type` allowlist rejecting `EXECUTE_ARBITRARY_COMMAND`. Added a
  bash harness `supabase/tests/run.sh` (mirrors `run.ps1`; `npm run test:db:sh`);
  `run.ps1` now applies both new migrations and runs the Phase-2 assertions.
- **`run.sh` PASSED** against a throwaway `postgres:17-alpine` (executed here;
  `run.ps1` carries identical coverage for Windows but was not re-run in this
  environment): all six migrations apply cleanly; Phase 1 + Phase 2 RLS pass — a
  project/incident id is never enough by itself to read or write another tenant's
  rows.
- `npm run verify` (tsc + lint) clean; isolated production build succeeds
  (`NEXT_BUILD_DIR=.next-verify npm run build`, to avoid colliding with a live
  `next dev` on the shared `.next`).

> The change log below predates Phase 2 (Projects Home round, Phase 1).

## 2-earlier. What Changed (Projects Home round)

- Rebuilt `/projects` as the full Projects Home design from `Stitch Designs/User_Profile/code.html` (that reference file is the Projects Home screen, not a user-profile screen — confirmed and confirmed with the user before implementing).
- New: `lib/projects.ts`, `components/projects/{ProjectsView,ProjectCard,ProjectTable,ProjectHealth,RefreshProjectsButton,DatabaseSetupNotice}.tsx`, `components/auth/UserGreeting.tsx`, `app/projects/loading.tsx`. Changed: `app/projects/page.tsx`, `lib/supabase/middleware.ts`, `components/ui/Badge.tsx` (added `unknown` + `maintenance` tones), `package.json` (added `verify` + `clean` scripts).
- Data integrity: no telemetry backend exists, so `public.projects` rows map to `health: null` → rendered as an explicit dashed **Unknown** badge. Services/incidents show `—`, deployment shows "Not available", last-checked shows "Never checked". The design's `Sync Telemetry` / `Add Project` buttons were **not** shipped as dead CTAs: `Add Project` is omitted (the wizard in `Screen_Navigation.md` §7 does not exist yet — RULE.md §5.3 no dead ends) and sync is a `router.refresh()` labelled "Refresh".

### 2a. Bug fixes this round

1. **CSS disappeared on reload (`/_next/static/*` 404).** Cause: `next build` was run while `next dev` was running. `next build` rewrites `.next`, so the live dev server's HTML kept referencing asset paths that no longer existed — every reload served unstyled HTML. Fix: kill dev → `npm run clean` → restart dev. **Rule: never run `next build` while `next dev` is running; use `npm run verify` (tsc + lint) for checks that don't need a production build.**
2. **`/projects` did a duplicate auth round trip.** `supabase.auth.getUser()` (a network call, ~875 ms here) ran in middleware *and* again in the page. Middleware now forwards the verified user id on `x-safeguard-user-id`, and the page reads it via `headers()` and **fails closed** (redirect to `/login`) if absent. The inbound header is deleted before use so it cannot be spoofed — verified: sending a forged header still yields `307 → /login`. Middleware also now builds its response once and applies refreshed session cookies to it, instead of recreating the response mid-flight.
3. **Serial DB reads.** The `profiles` and `projects` reads now run via `Promise.all`.
4. **Misleading error.** A missing `public.projects` table was reported as "the project service may be temporarily unavailable". It is actually a setup problem: `supabase/migrations/*.sql` were never pushed. `DatabaseSetupNotice` now detects `PGRST205`/`42P01`/`PGRST202` and shows the exact `supabase link` + `supabase db push` commands. Also removed the misleading hard-coded "Reference: projects_select_org_member" line from the UI.
5. **No loading UI.** Added `app/projects/loading.tsx` — a layout-matching skeleton (`Design.md` §31).

### 2b. Verified

`npm run verify` (tsc + lint) clean; `npm run build` clean with the dev server stopped; `/projects` anon → `307 /login?next=%2Fprojects`; forged auth header still rejected; `layout.css` → 200 across 6 consecutive reloads; warm `/login` 77–109 ms, `/projects` redirect 18 ms.

### 2d. Sample data (this round)

`supabase/migrations/20260930000000_project_telemetry_and_rls_fix.sql` adds the
operational columns the Projects Home already renders (`environment`,
`repository`, `health`, `service_count`, `active_incident_count`,
`last_checked_at`, `health_warning`, deployment fields, `is_demo`) **and**
repairs the Phase 1 RLS, which was unusable. Three genuine bugs, each found by
executing the migrations against a throwaway Postgres (`npm run test:db`):

1. **Infinite recursion.** `organization_members` policies queried
   `organization_members`, and the `organizations`/`projects` policies queried
   it too — Postgres raises *infinite recursion detected in policy* on every
   read. Replaced with `SECURITY DEFINER` helpers `is_org_member()` and
   `has_org_admin_role()` (`search_path = ''`, scoped to `auth.uid()`).
2. **No way to become a member.** `organization_members` had no INSERT policy,
   so `projects_insert_org_member` could never be satisfied. Added
   `members_insert_self_into_own_org`, restricted to organizations the caller
   created.
3. **`INSERT ... RETURNING` was silently blocked.** RLS applies the SELECT
   policy to `RETURNING`. An org creator is not yet a member, so
   `insert ... .select("id")` returned nothing and self-serve onboarding could
   not work. Added `organizations_select_creator`.
   Also added missing UPDATE policies on `projects` and `organizations` —
   without them every `update` matched zero rows, which looks like a
   successful save from the client.

`npm run test:db` runs the four SQL files in order against
`postgres:17-alpine` in a throwaway container and asserts, as the
`authenticated` role: signup trigger, no policy recursion, onboarding, telemetry
round-trip, health CHECK constraint, tenant isolation (read/insert/update), and
scoped delete. Currently **PASSED**.

Seeding: `lib/projects/demo-data.ts` holds the six approved sample projects;
`app/api/dev/seed/route.ts` (`POST` = create, `DELETE` = remove) creates the
org, the owner membership and the rows. `components/projects/DemoDataControls.tsx`
exposes it on `/projects` in development only. **Verified guards:** the route
answers `404` under `next start` (production) and `401` when signed out; the
controls are not rendered in production. Rows carry `is_demo = true`, and the
UI shows a violet "Sample data — not real telemetry" banner plus a per-card
Sample badge, per RULE.md §9.1.

> **Still blocked on you:** run `npx supabase link --project-ref afbuzhsnnczfawuwnglr`
> then `npx supabase db push`. The migrations are verified locally but the
> linked project still has zero `public.*` tables.


### 2c. Earlier verification (Projects Home build)

Dev-server smoke test on a temporary, since-removed `app/design-preview` route rendered 6 cards with all six health states, the health strip (6 / 2 Healthy / 1 Warning / 1 Critical / 1 Unknown), search + `/` kbd, both popovers, sort label, grid+list switchers, and telemetry meta blocks (commit hashes `f41c9b`/`e3290b`/`c4819a`); empty-state branch verified separately (0 cards, correct message). The temporary preview route was deleted.

## 3. Important Files

- `Docs/Architecture.md` — technical baseline (§20 Go monolith, §22 Next.js app routes, 10 phases).
- `Docs/Design.md` — visual contract (palette, LLM Rules 1–12).
- `Docs/Screen_Navigation.md` — canonical routes (§46), journeys (§47–53).
- `Docs/RULE.md` — engineering rules (loaded via `opencode.json`).
- `Docs/PROJECT_STATE.md` — this file.
- `Stitch Designs/Landing Page/code.html` + `Stitch Designs/User_Profile/code.html` — design references (the latter = Projects Home).
- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/icon.svg` — landing entry.
- `components/landing/*.tsx` (14 files), `components/ui/*.tsx` (7 files: +`auth.tsx`), `components/auth/AuthShell.tsx`, `app/login/`, `app/register/`, `lib/site.ts` — app implementation.
- `components/projects/*.tsx` (6 files), `lib/projects.ts`, `app/projects/{page,layout,loading}.tsx` — Projects Home.
- `tailwind.config.ts`, `package.json`, `tsconfig.json`, `next.config.js` — foundation config.
- `.env.example` / `.env`, `backend/cmd/api/main.go`, `backend/go.mod` — env + backend stub.

## 4. Unfinished Work

- [ ] **`supabase link` + `supabase db push` is still pending and is now the top blocker.** Project `afbuzhsnnczfawuwnglr` has zero `public.*` tables — `projects`, `profiles`, `organizations`, `organization_members` all return `PGRST205`. Login works (auth-only), but `/projects` cannot read anything. `.env.local` is now filled in, so this is runnable: `npx supabase link --project-ref afbuzhsnnczfawuwnglr` then `npx supabase db push`.
- [ ] Auth dashboard steps (cannot be done from code; verified against live project: `POST /auth/v1/signup` -> 429 `over_email_send_rate_limit`, `mailer_autoconfirm: false`): (1) connect Resend SMTP in Supabase dashboard — removes the rate limit; (2) add `{{ .Token }}` to the Confirm-signup email template — makes the 6-digit code appear; (3) allow `/auth/callback` in Redirect URLs. Full steps + exact values in `Docs/Auth-Resend-SMTP.md` §3–§6.
- [x] **Add Project wizard (Phase 3) is implemented in code and verified locally** —
  ten-step `AddProjectWizard` (dialog + `/projects/new`), real GitHub analysis
  API, idempotent `createProjectFromOnboarding`, `project_drafts` /
  `project_configs` / `project_env_vars` migration + RLS tests. Still
  future: K8s/logs/metrics/alerts/dependencies/security/settings screens.
- [ ] **End-to-end run against a real database is not yet done** — Phase 2 is
  proven by unit tests + local RLS harness only. It cannot be exercised through
  the UI until `supabase db push` lands the schema on the linked project.
- [ ] Telemetry columns don't exist on `public.projects` — add them (environment, repository, health, service/incident counts, last_checked_at, deployment) via a migration before the health filters can return anything other than `unknown`. Until then `/projects` correctly shows everything as Unknown/Not available.
- [ ] Backend modules (auth, projects, monitors, incidents, detection, correlation, ...) + PostgreSQL + NATS + observability backends — stub only.
- [ ] No CI, Docker image, or infra manifests for the app yet. Test coverage now
  exists (`npm run test:unit` = 31 Node tests; `npm run test:db` / `test:db:sh` =
  SQL RLS harness) but there is no browser/E2E runner wired up.
- [ ] Next.js 14.2.13 has a published security advisory (npm warn) — upgrade to patched 14.x/15.x when convenient.

## 5. Known Issues / Gaps

- Go toolchain not installed on this machine — backend stub is unvalidated (`go run ./cmd/api` never executed).
- Stitch token drift: the reference uses Material-3 tokens (`surface-container-*`, `primary-container`, Material Symbols) that do **not** match `Design.md`'s approved palette. The Projects Home was reconciled onto the canonical tokens (`surface`, `canvas`, `subtle`, `border-hairline`, `brand`, `success`/`warning`/`critical`/`info`/`ai`, Inter + JetBrains Mono) and `lucide-react` icons. Same drift still applies to any future screen built from Stitch files.
- `Docs/` vs `docs/` casing: actual folder is `Docs/`; instructions sometimes say `docs/` — harmless on Windows, risky on Linux CI.
- Dev server note: user's long-running port-3000 process wedged (`missing required error components` loop / 500s on all routes — stale `.next` dev cache). Killed the stale process, deleted `.next`, started a fresh `next dev -p 3000` (background job) — page back to 200 with terminal markup present.

## 6. Next Recommended Task

**Unblock the database, then run the workflow for real (wizard included):**
1. **You (owner) must push the schema** — the CLI is not linked here and I must
   not fabricate a DB application:
   ```sh
   supabase login
   supabase link --project-ref afbuzhsnnczfawuwnglr
   supabase db push
   ```
   This applies all six `public.*` migrations (core → telemetry → incident
   domain → detection/verification → onboarding).
2. Once pushed, exercise the full loop through the UI on a demo project: run a
   controlled failure → detection opens an incident → investigate evidence →
   request AI analysis (deterministic provider) → approve a remediation →
   verification confirms recovery over N healthy checks → incident resolves →
   open the report and the JSON export. Then walk the Add Project wizard
   end-to-end: public repo (detected path) and no-repo (manual path) →
   Review → Start Monitoring creates exactly one project → Open Dashboard.
3. Add a browser/E2E acceptance test (deterministic AI provider only) covering
   that path.
4. Install the Go toolchain and flesh out `backend/` if/when the platform needs a
   control plane beyond Supabase.

**Do NOT deploy yet** (per the active directive) — deployment comes after the
above is exercised end-to-end against a real database.

## 7. Workflow Reminder

- Before work: read this file → relevant sections of `Architecture.md` → only task-relevant files.
- After meaningful work: update §1, §2, §3, §4, §5, §6 in this file.
