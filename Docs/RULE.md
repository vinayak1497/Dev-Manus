# RULE.md --- Project Engineering Rules

**Project:** Intelligent Application & Infrastructure Monitoring
Platform\
**Purpose:** Strict engineering rules for OpenCode and other coding
agents working in this repository.\
**Authority:** This file defines mandatory project behavior.\
**Related specifications:** `Design.md` and
`Product-Information-Architecture.md`.

> **IMPORTANT --- OpenCode integration**
>
> OpenCode V2 natively discovers `AGENTS.md`. If this file is kept as
> `RULE.md`, it must be explicitly loaded through `opencode.json`:
>
> ``` json
> {
>   "$schema": "https://opencode.ai/config.json",
>   "instructions": ["RULE.md"]
> }
> ```
>
> Prefer keeping this file at the repository root. If the project also
> contains a root `AGENTS.md`, that file should remain concise and
> should not contradict this document.

------------------------------------------------------------------------

# 1. Mandatory Operating Mode

The agent MUST follow these rules unless a higher-priority
system/developer instruction requires otherwise.

## 1.1 Read before modifying

Before making a meaningful code change, inspect the relevant existing
implementation.

Do not modify files based only on filenames or assumptions.

At minimum, inspect:

-   Relevant source files
-   Existing components used by the target feature
-   Relevant routes
-   Relevant types/interfaces
-   Relevant tests
-   Relevant project documentation

## 1.2 Follow the repository architecture

Do not introduce a new architectural pattern when an existing project
pattern already solves the problem.

Prefer:

``` text
Existing pattern
    ↓
Reuse
    ↓
Extend
    ↓
Refactor only if necessary
    ↓
Introduce new pattern only when justified
```

## 1.3 Minimal change principle

Make the smallest coherent change that completely solves the requested
task.

Do NOT:

-   Rewrite unrelated code
-   Refactor unrelated modules
-   Rename unrelated files
-   Change dependencies without need
-   Change visual design without need
-   Introduce speculative abstractions
-   Modify generated files directly

------------------------------------------------------------------------

# 2. Project Documentation Is a Contract

The repository contains dedicated project specifications.

## 2.1 `Design.md`

Use `Design.md` when working on:

-   UI
-   UX
-   Components
-   Colors
-   Typography
-   Spacing
-   Layout
-   Accessibility
-   Charts
-   Status indicators
-   AI visual treatment
-   Responsive behavior
-   Motion

**Rule:**

> Never invent a new visual language when the required design already
> exists in `Design.md`.

------------------------------------------------------------------------

## 2.2 `Product-Information-Architecture.md`

Use `Product-Information-Architecture.md` when working on:

-   Pages
-   Screens
-   Routes
-   Navigation
-   Breadcrumbs
-   Project hierarchy
-   User flows
-   Entity relationships
-   Page-to-page transitions

**Rule:**

> Before creating a new page or route, check whether the functionality
> already belongs to an existing screen.

------------------------------------------------------------------------

## 2.3 Documentation precedence

For project-specific decisions:

``` text
System / Developer Instructions
        ↓
Explicit User Request
        ↓
RULE.md
        ↓
Design.md / Product-Information-Architecture.md
        ↓
Existing Repository Conventions
        ↓
General Agent Preference
```

Do not use general preferences to override project-specific rules.

------------------------------------------------------------------------

# 3. Before Starting a Task

For every non-trivial task:

1.  Understand the requested outcome.
2.  Identify affected area(s).
3.  Inspect the relevant existing code.
4.  Check `Design.md` if UI/UX is involved.
5.  Check `Product-Information-Architecture.md` if
    navigation/pages/routes are involved.
6.  Identify existing reusable components/services/utilities.
7.  Make a concise implementation plan internally.
8.  Implement the smallest coherent solution.
9.  Verify the result.
10. Report what changed and what was verified.

Do not begin large implementation work without understanding the
existing structure.

------------------------------------------------------------------------

# 4. Page and Screen Rules

## 4.1 Before creating a page

The agent MUST answer these questions:

``` text
1. Does this functionality already exist?
2. Which product area owns it?
3. Should it be a page, detail page, drawer, modal, or wizard step?
4. What is its parent route?
5. Where does the user enter it?
6. Where can the user go next?
7. What project context does it require?
```

## 4.2 Do not create duplicate screens

If an existing screen can reasonably support the functionality, extend
that screen instead of creating another screen.

## 4.3 Do not create random sidebar items

A feature belongs in primary navigation only if it represents a
persistent, major product area.

Use a:

-   Section
-   Tab
-   Drawer
-   Modal
-   Detail page

when appropriate.

## 4.4 Preserve project context

Project-specific screens must remain scoped to the selected project.

Conceptually:

``` text
/project/:projectId/...
```

Do not accidentally display data from another project.

------------------------------------------------------------------------

# 5. Navigation Rules

## 5.1 Canonical operational navigation

The default project navigation is:

``` text
Dashboard

OBSERVE
├── Health & Incidents
├── Services
├── Infrastructure
├── Kubernetes
├── Logs
└── Metrics

OPERATE
├── Alerts & Rules
├── Deployments
└── Dependencies

SECURITY
└── Security & Code Quality

INTELLIGENCE
└── AI / Insights

REPORTING
└── Reports

CONFIGURATION
└── Settings
```

Do not alter this structure casually.

## 5.2 Cross-entity navigation

Related entities should be navigable where useful.

Examples:

``` text
Incident → Service
Incident → Deployment
Incident → Logs
Incident → Metrics

Service → Dependencies
Service → Incidents
Service → Deployment

Deployment → Service
Deployment → Incident
Deployment → Logs

Kubernetes Pod → Node
Kubernetes Pod → Logs
Kubernetes Pod → Metrics

Security Finding → Dependency
Security Finding → Service
Security Finding → Deployment
```

## 5.3 No navigation dead ends

Every major page must provide a sensible way to:

-   Return to its parent
-   Navigate to relevant related entities
-   Continue the current workflow

------------------------------------------------------------------------

# 6. UI Implementation Rules

When implementing UI:

## 6.1 Use existing components first

Before creating a new component:

1.  Search for an existing component.
2.  Determine whether it can be reused.
3.  Extend it if appropriate.
4.  Create a new component only when the behavior is genuinely
    different.

Do not duplicate buttons, cards, badges, tables, modals, or navigation
components.

## 6.2 Follow `Design.md`

The approved semantic palette is:

``` text
Primary       #155EEF
Primary Hover #1047C7
Primary Light #E8F0FE
Secondary     #0F766E

Background    #F8FAFC
Surface       #FFFFFF
Border        #CBD5E1

Text          #0F172A
Text Secondary#475569

Healthy       #15803D
Warning       #B45309
Critical      #B42318
Information   #0369A1
AI            #7C3AED
```

Do not introduce arbitrary status colors.

## 6.3 Semantic color rules

``` text
Blue   = product interaction
Green  = healthy
Amber  = warning/degraded
Red    = critical/failure
Violet = AI/insights
```

Do not use health colors decoratively.

## 6.4 Never use color alone for state

Every important status must also have:

-   Text
-   Icon
-   Symbol
-   Shape
-   Or another non-color indicator

------------------------------------------------------------------------

# 7. Accessibility Rules

Every UI change MUST consider accessibility.

Required where applicable:

-   Semantic HTML
-   Keyboard navigation
-   Visible focus state
-   Accessible labels
-   Sufficient contrast
-   Form error messaging
-   Non-color status indicators
-   Reduced-motion support

Do not knowingly introduce inaccessible controls.

------------------------------------------------------------------------

# 8. Responsive Design Rules

Every new UI feature must have a responsive strategy.

Desktop is the primary operational environment, but the UI must remain
usable on smaller screens.

At smaller widths:

-   Collapse navigation appropriately.
-   Stack cards when required.
-   Prioritize important table columns.
-   Preserve access to critical actions.
-   Avoid simply shrinking desktop UI until it becomes unusable.

------------------------------------------------------------------------

# 9. Data and Monitoring Rules

This is a monitoring platform.

The UI must distinguish between:

``` text
Raw telemetry
     ↓
Derived metric
     ↓
Detected anomaly
     ↓
AI interpretation
     ↓
Recommended action
```

Never represent these as if they are the same thing.

## 9.1 Do not fabricate production telemetry

Mock data may be used during development, but it must be clearly
identifiable as mock/development data where ambiguity could exist.

Never present invented operational data as real production telemetry.

## 9.2 Unknown is not Healthy

Use distinct states:

``` text
Healthy
Warning
Critical
Unknown
Maintenance
Recovering
```

Do not silently convert unavailable monitoring data into a healthy
state.

------------------------------------------------------------------------

# 10. AI Rules

AI is an assistance layer, not a source of unquestionable truth.

## 10.1 Distinguish fact from inference

Prefer:

``` text
Observation
Evidence
Interpretation
Confidence
Suggested action
```

Avoid presenting an inference as a confirmed fact.

Prefer:

-   Possible cause
-   Likely related
-   Evidence suggests
-   Detected correlation
-   Consider investigating

Avoid unsupported statements such as:

-   This definitely caused the outage.
-   This is certainly the root cause.

## 10.2 AI must link to evidence

When possible, AI insights should point to:

-   Logs
-   Metrics
-   Events
-   Deployments
-   Services
-   Infrastructure
-   Alerts

The user must be able to investigate the underlying evidence.

## 10.3 AI visual identity

Use the project's AI color:

``` text
#7C3AED
```

Do not use violet as a normal system-health state.

------------------------------------------------------------------------

# 11. Security Rules

Security is a first-class concern.

## 11.1 Never expose secrets

Do not:

-   Print secrets to logs
-   Commit secrets
-   Put secrets into source code
-   Display secret values unnecessarily
-   Include secrets in error messages
-   Include credentials in screenshots/examples

Use environment variables or the project's secret-management mechanism.

## 11.2 Do not weaken security for convenience

Do not disable:

-   Authentication
-   Authorization
-   TLS verification
-   Input validation
-   Security middleware
-   Secret masking

unless the user explicitly requests a controlled development-only change
and the scope is clear.

## 11.3 Validate external input

Treat input from:

-   Users
-   Repositories
-   APIs
-   Webhooks
-   Logs
-   Configuration files
-   Environment variables

as untrusted unless validated.

------------------------------------------------------------------------

# 12. API and Backend Rules

When modifying backend/API behavior:

## 12.1 Preserve contracts

Do not silently change:

-   Request shape
-   Response shape
-   Error format
-   Authentication behavior
-   Status codes

without checking existing consumers.

## 12.2 Validate at boundaries

Validate external input at API/service boundaries.

## 12.3 Errors must be actionable

Errors should provide enough context for debugging without leaking
sensitive information.

## 12.4 Do not hide failures

Monitoring software must not silently swallow errors.

If an operation fails:

-   Handle it intentionally.
-   Log appropriate diagnostic information.
-   Return an appropriate error.
-   Preserve system state.

------------------------------------------------------------------------

# 13. Database Rules

When database changes are required:

1.  Inspect the existing schema and migration system.
2.  Follow existing migration conventions.
3.  Never modify production data directly as part of ordinary
    development.
4.  Do not delete or rewrite existing migrations casually.
5.  Preserve backward compatibility where required.
6.  Update affected types/models/queries.
7.  Test the migration path.

Never invent a new database access pattern if the repository already has
one.

------------------------------------------------------------------------

# 14. Dependency Rules

Do not add a dependency merely because it makes one small task easier.

Before adding a dependency:

1.  Check whether the repository already provides equivalent
    functionality.
2.  Check whether the platform/runtime provides the capability.
3.  Consider bundle/runtime/security impact.
4.  Use a maintained and appropriate package when a dependency is
    justified.
5.  Keep the dependency addition narrowly scoped.

Do not upgrade unrelated dependencies during feature work unless
required.

------------------------------------------------------------------------

# 15. Configuration Rules

Configuration must remain explicit and understandable.

Do not hardcode:

-   Credentials
-   API keys
-   Environment-specific URLs
-   Production-only values
-   Secrets

Prefer configuration through the project's established
environment/configuration mechanism.

------------------------------------------------------------------------

# 16. File and Code Organization

Follow the existing repository structure.

When creating files:

-   Put them in the established directory for their responsibility.
-   Use existing naming conventions.
-   Keep modules focused.
-   Avoid giant catch-all files.
-   Avoid deeply nested abstractions without a reason.

Do not reorganize the repository solely for aesthetic reasons.

------------------------------------------------------------------------

# 17. Generated Files

Do not manually edit generated files unless the project explicitly
requires it.

Instead:

``` text
Source
  ↓
Generator
  ↓
Generated output
```

If generated output changes, use the project's generation process.

------------------------------------------------------------------------

# 18. Testing and Verification

A change is not complete merely because the code was written.

## 18.1 Verify proportionally

For every change, run the narrowest meaningful verification first.

Examples:

``` text
Component change
→ component/unit test + typecheck/lint

API change
→ API tests + typecheck

Database change
→ migration validation + relevant tests

Large feature
→ focused tests + build/typecheck/lint
```

## 18.2 Do not claim tests were run if they were not

The final response must accurately state what was verified.

Use:

``` text
Verified:
- npm run typecheck
- npm test
```

only if those commands were actually executed.

If verification could not be run, say so.

## 18.3 Fix failures caused by the change

If a test/typecheck/build failure is introduced by the implementation,
investigate and fix it before declaring the task complete.

## 18.4 Never run `next build` while `next dev` is running

This project shares one `.next` directory between the development
server and the production build.

``` text
`next build` rewrites `.next`
      ↓
the live dev server keeps serving HTML that
references asset paths that no longer exist
      ↓
`/_next/static/*.css` and `/_next/static/chunks/*.js` return 404
      ↓
the whole app renders unstyled on every reload
```

Rules:

-   Use `npm run verify` (`tsc --noEmit` + `next lint`) for routine
    checks. It never touches `.next`.
-   Only run `npm run build` when the dev server is stopped, and say so
    in the report.
-   If the app suddenly renders with no CSS, this is the first thing to
    check. Fix: stop the dev server, `npm run clean`, restart it.

``` text
Unstyled page?
  ├─ CSS/JS 404 in the network tab → build/dev cache clash (§18.4)
  └─ CSS loads but looks wrong    → real styling bug
```

Do not hide failures.

------------------------------------------------------------------------

# 19. Git Rules

Do not perform destructive Git operations unless explicitly requested.

Do not casually use:

``` text
git reset --hard
git clean -fd
git checkout -- .
git restore .
```

Do not overwrite unrelated user changes.

Before modifying files with existing uncommitted changes:

-   Inspect the current state.
-   Preserve unrelated changes.
-   Modify only what belongs to the task.

Do not create commits unless explicitly requested.

------------------------------------------------------------------------

# 20. Refactoring Rules

Refactoring is allowed only when it improves the requested change or is
necessary to safely implement it.

Do not turn a feature request into a repository-wide refactor.

When refactoring:

-   Keep behavior unchanged unless behavior change is intentional.
-   Keep the diff understandable.
-   Verify after the refactor.
-   Avoid mixing unrelated refactors with feature work.

------------------------------------------------------------------------

# 21. Monitoring-Specific UX Rules

The product's core operational loop is:

``` text
Observe
  ↓
Detect
  ↓
Investigate
  ↓
Understand
  ↓
Act
  ↓
Verify
```

Every major monitoring feature should support this loop.

## 21.1 Critical information comes first

Prioritize:

1.  Active critical failures
2.  High-severity problems
3.  Degraded systems
4.  Important anomalies
5.  Current health
6.  Trends
7.  Historical information
8.  Configuration/details

Do not give equal visual weight to every metric.

## 21.2 Investigation evidence must be accessible

When showing an incident or anomaly, provide paths to relevant:

-   Logs
-   Metrics
-   Events
-   Deployments
-   Dependencies
-   Infrastructure

------------------------------------------------------------------------

# 22. Performance Rules

Avoid unnecessary performance regressions.

## Frontend

Be careful with:

-   Large lists
-   Large log streams
-   Unnecessary re-renders
-   Heavy chart rendering
-   Unbounded polling
-   Large bundles

Use pagination/virtualization where appropriate.

## Backend

Be careful with:

-   N+1 database queries
-   Unbounded queries
-   Excessive polling
-   Expensive synchronous operations
-   Duplicate external requests

Monitoring systems must themselves be efficient enough to monitor
systems.

------------------------------------------------------------------------

# 23. Real-Time Data Rules

When implementing live monitoring:

-   Do not unnecessarily reload the entire page.
-   Avoid destroying the user's investigation context.
-   Update only affected data where practical.
-   Show last-updated information.
-   Make refresh behavior understandable.
-   Avoid uncontrolled polling loops.

For critical state changes, make the change visible without causing
disruptive layout shifts.

------------------------------------------------------------------------

# 24. Logging Rules

Logs should help diagnose problems without becoming a security risk.

Do not log:

-   Passwords
-   API keys
-   Tokens
-   Secret values
-   Sensitive credentials

Use appropriate log levels.

Avoid noisy debug logging in production paths.

------------------------------------------------------------------------

# 25. Error Handling Rules

Every meaningful user-facing operation should have intentional handling
for:

``` text
Loading
Success
Empty
Error
Permission denied
Not found
```

Do not leave blank screens or unexplained failures.

Errors should explain:

1.  What failed.
2.  Whether the user can retry.
3.  What the user can do next.

------------------------------------------------------------------------

# 26. Empty State Rules

An empty state should explain:

``` text
What is empty?
Why might it be empty?
What should the user do next?
```

Example:

> No applications are being monitored yet.\
> Connect an application to start collecting health and performance
> data.

------------------------------------------------------------------------

# 27. Change Management Rules

When changing an existing feature:

1.  Identify affected files.
2.  Identify dependent components.
3.  Identify affected routes.
4.  Identify tests.
5.  Make the change.
6.  Run focused verification.
7.  Check for regressions.
8.  Update documentation if behavior/architecture changed.

------------------------------------------------------------------------

# 28. Documentation Rules

Update project documentation when a change modifies:

-   Architecture
-   Navigation
-   Routes
-   Setup
-   Configuration
-   Developer workflow
-   Public behavior
-   Important operational behavior

Do not create unnecessary documentation for trivial implementation
details.

------------------------------------------------------------------------

# 29. Do Not Guess

When information is unavailable, do not silently invent it.

Examples:

-   Unknown API contract
-   Unknown environment variable
-   Unknown route
-   Unknown schema
-   Unknown deployment behavior
-   Unknown infrastructure configuration

Inspect the repository or ask the user when necessary.

------------------------------------------------------------------------

# 30. Avoid Overengineering

The project is being developed incrementally.

Do not build infrastructure for hypothetical future requirements unless
it is clearly justified.

Prefer:

``` text
Simple correct implementation
        ↓
Verified behavior
        ↓
Reusable abstraction when repetition appears
```

Avoid:

``` text
Hypothetical requirement
        ↓
Complex abstraction
        ↓
Multiple layers
        ↓
No actual use
```

------------------------------------------------------------------------

# 31. No Silent Product Decisions

If an implementation requires a product decision that is not defined by:

-   User request
-   Existing code
-   `Design.md`
-   `Product-Information-Architecture.md`
-   Existing documented convention

do not silently make a significant product decision.

For small implementation details, choose the least surprising option.

For significant behavior, ask the user or clearly surface the
assumption.

------------------------------------------------------------------------

# 32. Final Response Rules for the Agent

After completing a task, report concisely:

### Changed

What was implemented.

### Files

Which important files changed.

### Verification

Which commands/tests were actually run.

### Notes

Any remaining limitation, assumption, or follow-up.

Do not provide a long narrative unless requested.

------------------------------------------------------------------------

# 33. Definition of Done

A task is complete only when:

-   [ ] Requested behavior is implemented.
-   [ ] Existing architecture was respected.
-   [ ] Existing components/patterns were reused where appropriate.
-   [ ] Relevant design documentation was followed.
-   [ ] No duplicate page/navigation was introduced.
-   [ ] Project context is preserved.
-   [ ] Accessibility was considered for UI changes.
-   [ ] Security implications were considered.
-   [ ] Relevant tests/checks were run.
-   [ ] New failures caused by the change are resolved.
-   [ ] Documentation was updated when required.
-   [ ] No unrelated files were modified unnecessarily.
-   [ ] Final status accurately reports verification.

------------------------------------------------------------------------

# 34. Non-Negotiable Rules --- Quick Reference

When speed conflicts with correctness, these rules still apply.

``` text
1. DO NOT invent architecture when existing architecture applies.

2. DO NOT create a new page before checking
   Product-Information-Architecture.md.

3. DO NOT create new UI styling before checking Design.md.

4. DO NOT duplicate existing components.

5. DO NOT expose secrets.

6. DO NOT fabricate production telemetry.

7. DO NOT present AI inference as confirmed fact.

8. DO NOT use color alone for system status.

9. DO NOT destroy unrelated user changes.

10. DO NOT run destructive Git operations without explicit approval.

11. DO NOT claim verification that was not performed.

12. DO NOT hide or silently swallow errors.

13. DO NOT add dependencies without justification.

14. DO NOT overengineer hypothetical requirements.

15. DO NOT make significant silent product decisions.

16. DO NOT declare a task complete until the relevant
    implementation has been verified.
```

------------------------------------------------------------------------

# 35. Agent Decision Loop

For every meaningful task, use this loop:

``` text
REQUEST
   ↓
UNDERSTAND
   ↓
INSPECT EXISTING CODE
   ↓
CHECK RELEVANT PROJECT DOCS
   ↓
IDENTIFY REUSE OPPORTUNITIES
   ↓
PLAN MINIMAL CHANGE
   ↓
IMPLEMENT
   ↓
VERIFY
   ↓
FIX FAILURES
   ↓
RE-CHECK ARCHITECTURE / UX
   ↓
REPORT
```

The agent's goal is not to produce the most code.

The goal is to produce the **smallest correct, maintainable, verifiable
change that fits the existing product.**
