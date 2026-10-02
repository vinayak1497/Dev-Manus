# Product Information Architecture & Screen Navigation

**File:** `Product-Information-Architecture.md`\
**Status:** Living product/navigation specification\
**Audience:** Developers, UI/UX designers, LLM agents, QA, product
reviewers\
**Purpose:** Single source of truth for the application's pages,
screens, screen responsibilities, navigation hierarchy, and user flows.

> **Important:** This document defines **what pages/screens exist, what
> each screen contains, and how users move between them**.\
> It does **not** define detailed visual styling. For colors,
> typography, spacing, components, accessibility, motion, and visual
> design rules, refer to `Design.md`.

------------------------------------------------------------------------

# 1. Product Mental Model

The product is a project-centric DevOps monitoring and operational
intelligence platform.

The core mental model is:

``` text
User
  ↓
Projects
  ↓
Select Project
  ↓
Monitor / Investigate / Operate
  ↓
Understand system health
  ↓
Detect failures
  ↓
Investigate evidence
  ↓
Take action
```

A user should normally work **inside a selected project**.

A project represents an application/system and its associated:

-   Repository
-   Services
-   Runtime
-   Infrastructure
-   Kubernetes resources
-   Databases
-   Dependencies
-   Monitoring configuration
-   Alerts
-   Deployments
-   Security findings
-   Incidents
-   AI insights

------------------------------------------------------------------------

# 2. Navigation Principles

## 2.1 Project-first navigation

The user selects a project before accessing most operational screens.

``` text
Projects Home
     ↓
Select Project
     ↓
Project Dashboard
     ↓
Project-specific screens
```

Operational information must remain scoped to the selected project
unless explicitly marked as global.

------------------------------------------------------------------------

## 2.2 Do not expose every screen in the primary navigation

The application may contain many screens, but the sidebar should expose
only major functional areas.

Use:

-   Pages for major workflows
-   Detail pages for important entities
-   Drawers for contextual information
-   Modals for short actions
-   Wizards for multi-step setup

Do not turn every form or detail view into a navigation item.

------------------------------------------------------------------------

## 2.3 Preserve user context

When navigating from one entity to another, preserve useful context
where possible.

Example:

``` text
Project Dashboard
   ↓
Incident
   ↓
Affected Service
   ↓
Related Deployment
   ↓
Deployment Logs
```

The user should be able to return to the previous investigation context
without restarting the workflow.

------------------------------------------------------------------------

## 2.4 Operational navigation vs configuration navigation

Separate:

### Operational

-   Dashboard
-   Health & Incidents
-   Services
-   Infrastructure
-   Kubernetes
-   Logs
-   Metrics
-   Alerts
-   Deployments
-   Dependencies
-   Security
-   AI Insights
-   Reports

from:

### Configuration

-   Project Settings
-   Integrations
-   Team & Access
-   Secrets
-   Notifications
-   Audit Log

Settings should not visually compete with active operational
information.

------------------------------------------------------------------------

# 3. Global Application Structure

The complete product is organized into five major areas:

``` text
PUBLIC
│
├── Landing
├── Features
├── How It Works
├── Documentation / Resources
├── Login
├── Register
├── Email Verification
├── Forgot Password
└── Reset Password

AUTHENTICATED / GLOBAL
│
└── Projects Home
      │
      ├── Add Project
      │
      └── Select Project
             │
             └── PROJECT APPLICATION
                    │
                    ├── Dashboard
                    ├── Health & Incidents
                    ├── Services
                    ├── Infrastructure
                    ├── Kubernetes
                    ├── Logs
                    ├── Metrics
                    ├── Alerts & Rules
                    ├── Deployments
                    ├── Dependencies
                    ├── Security & Code Quality
                    ├── AI / Insights
                    ├── Reports
                    │
                    └── Settings
                          ├── Project Settings
                          ├── Integrations
                          ├── Team & Access
                          ├── Secrets
                          ├── Notifications
                          └── Audit Log
```

------------------------------------------------------------------------

# 4. Public / Landing Screens

These screens are accessible before authentication.

------------------------------------------------------------------------

## 4.1 Landing Page

### Purpose

Communicate the product's value and direct visitors toward starting or
exploring the platform.

### Primary message

> **Monitor. Detect. Prevent. Keep your applications healthy.**

### Must contain

-   Hero
-   Product value proposition
-   How it works
-   What can be monitored
-   Failure detection
-   Infrastructure monitoring
-   Security/code quality
-   AI-powered analysis
-   Supported technologies
-   Architecture/product explanation
-   Primary CTA
-   Secondary CTA
-   Footer

### Primary navigation

``` text
Landing
├── Features
├── How It Works
├── Documentation / Resources
├── Login
└── Register
```

### Primary CTA

`Add Your Project`

This should lead to authentication when the user is not logged in.

### Secondary CTA

`Explore Demo`

------------------------------------------------------------------------

## 4.2 Features

### Purpose

Explain the platform's capabilities in detail.

### Must contain

-   Application monitoring
-   Kubernetes monitoring
-   Infrastructure monitoring
-   Logs
-   Metrics
-   Health checks
-   Security
-   Dependency monitoring
-   Incident detection
-   AI diagnosis
-   Deployment monitoring

### Navigation

``` text
Features
├── Login
└── Register
```

------------------------------------------------------------------------

## 4.3 How It Works

### Purpose

Explain the operational workflow.

### Primary flow

``` text
Connect Project
      ↓
Understand Architecture
      ↓
Monitor
      ↓
Detect
      ↓
Analyze
      ↓
Alert
      ↓
Resolve
```

### Navigation

Can link to:

-   Add Project
-   Features
-   Documentation
-   Login/Register

------------------------------------------------------------------------

## 4.4 Documentation / Resources

### Purpose

Provide product and technical documentation.

Potential sections:

-   Getting Started
-   Supported technologies
-   Installation
-   Architecture
-   API documentation
-   Troubleshooting

This may initially be a simplified screen and expanded later.

------------------------------------------------------------------------

# 5. Authentication Screens

------------------------------------------------------------------------

## 5.1 Login

### Must contain

-   Email
-   Password
-   Login action
-   Forgot password
-   Register link

Optional:

-   Continue with GitHub

### Navigation

``` text
Login
├── Register
├── Forgot Password
└── Projects Home  ← successful login
```

If the user was attempting to access a protected page, successful login
should return them to the intended destination when possible.

------------------------------------------------------------------------

## 5.2 Register

### Must contain

-   Name
-   Email
-   Password
-   Confirm password
-   Register action

Optional:

-   Continue with GitHub

### Navigation

``` text
Register
└── Email Verification
```

------------------------------------------------------------------------

## 5.3 Email Verification

### Purpose

Verify the user's email after registration.

### Navigation

``` text
Email Verification
└── Projects Home
```

------------------------------------------------------------------------

## 5.4 Forgot Password

### Must contain

-   Email
-   Send reset link

### Navigation

``` text
Forgot Password
└── Reset Password
```

------------------------------------------------------------------------

## 5.5 Reset Password

### Must contain

-   New password
-   Confirm password
-   Reset action

### Navigation

``` text
Reset Password
└── Login
```

------------------------------------------------------------------------

# 6. Projects Home

## Route concept

``` text
/projects
```

## Purpose

Global workspace showing all projects belonging to the user/team.

This is the first major screen after authentication.

## Must contain

-   Page title: `Projects`
-   Project search
-   `+ Add Project`
-   Project cards/list
-   Project health
-   Number of services
-   Number of incidents
-   Last deployment
-   Environment
-   Repository
-   Last checked
-   Project status

### Example conceptual structure

``` text
Projects

[ Search projects... ]                 [+ Add Project]

Your Projects

┌──────────────────┐
│ 🟢 ShopEasy      │
│ Healthy          │
│ 12 services      │
│ 1 incident       │
│ Production       │
└──────────────────┘

┌──────────────────┐
│ 🟡 Payments      │
│ Attention        │
│ 8 services       │
│ 2 incidents      │
│ Production       │
└──────────────────┘
```

### Navigation

``` text
Projects Home
├── Add Project
├── Select Project → Project Dashboard
└── Manage Projects
```

------------------------------------------------------------------------

# 7. Add Project Flow

Adding a project is a guided setup workflow.

It should **not** be implemented as many unrelated navigation pages.

Use one setup wizard with visible progress.

``` text
① Basics
② Repository
③ Analysis
④ Deployment
⑤ Environment
⑥ Runtime
⑦ Dependencies
⑧ Health
⑨ Review
⑩ Complete
```

The user should be able to:

-   Go back
-   Continue
-   Save and continue later
-   Cancel safely
-   See which steps are complete

------------------------------------------------------------------------

## 7.1 Project Basics

### Purpose

Collect the minimum project identity information.

### Must contain

-   Project name
-   Description
-   Project type
-   Environment
-   Tags

### Navigation

``` text
Project Basics
├── Back → Projects Home
└── Continue → Repository Connection
```

------------------------------------------------------------------------

## 7.2 Repository Connection

### Purpose

Connect the project to its source repository.

### Must contain

-   GitHub connection
-   Repository selector
-   Branch selector
-   Repository URL option

Potential future providers:

-   GitLab
-   Bitbucket

### Navigation

``` text
Repository Connection
├── Back → Project Basics
└── Continue → Repository Analysis
```

------------------------------------------------------------------------

## 7.3 Repository Analysis

### Purpose

Automatically inspect the repository and discover project
characteristics.

This is an important intelligence step.

### Must show

-   Connection status
-   Framework detection
-   Runtime detection
-   Docker detection
-   Kubernetes detection
-   Dependencies
-   Environment variables
-   Services
-   Configuration files

Example:

``` text
✓ Repository connected
✓ Detecting framework
✓ Detecting Docker configuration
✓ Detecting Kubernetes configuration
✓ Detecting dependencies
✓ Detecting environment variables
✓ Detecting services

Detected

Node.js
React
PostgreSQL
Redis
Docker
Kubernetes
3 services
```

### Navigation

``` text
Repository Analysis
├── Back → Repository Connection
└── Continue → Deployment Configuration
```

------------------------------------------------------------------------

# 8. Deployment Configuration

## Purpose

Configure or confirm how the application is deployed.

### Must support or plan for

-   Dockerfile
-   Docker Compose
-   Kubernetes manifests
-   Helm
-   Future infrastructure configuration such as Terraform

### Preferred behavior

Automatically detect configuration first.

Show:

``` text
✓ Dockerfile detected
✓ docker-compose.yml detected
✓ Kubernetes manifests detected
○ Helm chart detected
```

Then allow:

-   `Use detected configuration`
-   `Configure manually`

### Navigation

``` text
Deployment Configuration
├── Back → Repository Analysis
└── Continue → Environment & Secrets
```

------------------------------------------------------------------------

# 9. Environment & Secrets

## Purpose

Configure environment-specific variables while keeping secrets distinct.

### Sections

#### Environment variables

Examples:

``` text
DATABASE_HOST
DATABASE_PORT
REDIS_URL
API_URL
```

#### Secrets

Examples:

``` text
DATABASE_PASSWORD
JWT_SECRET
API_KEY
```

### Requirements

-   Environment selector
-   Add variable
-   Add secret
-   Mask secret values
-   Never expose secret values unnecessarily
-   Clearly distinguish variables from secrets

### Navigation

``` text
Environment & Secrets
├── Back → Deployment Configuration
└── Continue → Runtime Configuration
```

------------------------------------------------------------------------

# 10. Runtime Configuration

## Purpose

Define how the application runs.

### Must contain

-   Start command
-   Detected/override runtime
-   Ports
-   Protocol
-   Runtime configuration

Examples:

``` text
Application start command
npm start

Ports
Frontend  3000
Backend   8080
Database  5432

Protocol
HTTP / HTTPS / TCP / UDP
```

### Navigation

``` text
Runtime Configuration
├── Back → Environment & Secrets
└── Continue → Dependencies
```

------------------------------------------------------------------------

# 11. Dependencies & Database

## Purpose

Define or confirm application dependencies.

### Categories

#### Databases

-   PostgreSQL
-   MySQL
-   MongoDB

#### Caching

-   Redis

#### External services

-   Stripe
-   AWS S3
-   Firebase
-   SendGrid

The system should attempt repository/configuration detection before
asking the user to enter information manually.

### Navigation

``` text
Dependencies
├── Back → Runtime Configuration
└── Continue → Health Monitoring
```

------------------------------------------------------------------------

# 12. Health Monitoring Setup

## Purpose

Define how application health will be checked.

### Must contain

-   Health endpoint
-   Expected status
-   Check interval

Example:

``` text
Health endpoint
/api/health

Expected response
HTTP 200

Check interval
30 seconds
```

### Fallback when no health endpoint exists

Offer basic checks such as:

-   Port reachable
-   HTTP response
-   Container running
-   Pod running
-   Process alive

### Navigation

``` text
Health Monitoring
├── Back → Dependencies
└── Continue → Review & Connect
```

------------------------------------------------------------------------

# 13. Review & Connect

## Purpose

Give the user a complete configuration summary before monitoring begins.

### Must contain

-   Project
-   Repository
-   Deployment
-   Services
-   Infrastructure
-   Dependencies
-   Environment
-   Monitoring configuration

### Primary action

`Create & Start Monitoring`

### Navigation

``` text
Review & Connect
├── Back → previous setup step
└── Create & Start Monitoring → Setup Complete
```

------------------------------------------------------------------------

# 14. Project Setup Complete

## Purpose

Confirm that the project is ready.

### Must contain

``` text
Project is ready

✓ Repository connected
✓ Infrastructure discovered
✓ Services discovered
✓ Monitoring enabled
✓ Health checks enabled
```

### Primary action

`Go to Project Dashboard`

### Navigation

``` text
Setup Complete
└── Project Dashboard
```

------------------------------------------------------------------------

# 15. Project Application Shell

After selecting a project, use a persistent application shell.

Conceptually:

``` text
┌──────────────────────────────────────────────────────┐
│ Project Switcher | Breadcrumb/Search | User         │
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│ Sidebar      │             Main Content              │
│              │                                       │
│ Dashboard    │                                       │
│ Health       │                                       │
│ Services     │                                       │
│ Infra        │                                       │
│ Kubernetes   │                                       │
│ Logs         │                                       │
│ Metrics      │                                       │
│ Alerts       │                                       │
│ Deployments  │                                       │
│ Dependencies │                                       │
│ Security     │                                       │
│ AI Insights  │                                       │
│ Reports      │                                       │
│              │                                       │
│ Settings     │                                       │
└──────────────┴───────────────────────────────────────┘
```

------------------------------------------------------------------------

# 16. Project Switcher

The project switcher should be globally accessible inside the project
application.

Example:

``` text
🟢 ShopEasy ▼
```

Opening it:

``` text
Projects

🟢 ShopEasy
🟡 Payment API
🟢 Marketing Website

────────────────

+ Add Project
Manage Projects
```

### Navigation

``` text
Project Switcher
├── Project A → Project A Dashboard
├── Project B → Project B Dashboard
├── Add Project → Add Project Wizard
└── Manage Projects → Projects Home
```

------------------------------------------------------------------------

# 17. Global Search

Use a global search experience.

Recommended shortcut:

``` text
Ctrl/Cmd + K
```

Search should eventually cover:

-   Projects
-   Services
-   Incidents
-   Deployments
-   Pods
-   Logs
-   Alerts
-   Infrastructure resources

Search results should identify entity type.

Example:

``` text
payment-api
Application

payment-api-prod
Kubernetes Deployment
```

Selecting a result navigates directly to the corresponding entity.

------------------------------------------------------------------------

# 18. Project Dashboard

## Route concept

``` text
/projects/:projectId
```

## Purpose

This is the primary operational home for a project.

It must answer:

> **Is everything okay, and if not, what should I look at first?**

### Must contain

#### Project header

-   Project name
-   Environment
-   Overall health
-   Last checked

#### Health summary

-   Overall health
-   Health score where implemented
-   Active incidents
-   Critical alerts
-   Monitored services
-   Availability

#### Performance

-   CPU
-   Memory
-   Requests
-   Latency
-   Errors
-   Availability

#### Active incidents

-   Severity
-   Title
-   Service
-   Status
-   Started
-   Duration

#### Recent deployments

-   Version
-   Status
-   Time

#### Infrastructure

-   Nodes
-   Containers
-   Kubernetes workloads
-   Resource utilization

#### Security

-   Security findings
-   Code quality state

#### AI insights

-   Detected anomalies
-   Correlations
-   Investigation suggestions

### Primary navigation

From the dashboard the user can enter every major operational area.

``` text
Dashboard
├── Health & Incidents
├── Services
├── Infrastructure
├── Kubernetes
├── Logs
├── Metrics
├── Alerts & Rules
├── Deployments
├── Dependencies
├── Security
├── AI / Insights
└── Reports
```

------------------------------------------------------------------------

# 19. Health & Incidents

## Purpose

Answer:

> **Is something wrong?**

### Must contain

-   Active incidents
-   Resolved incidents
-   Severity
-   Status
-   Service
-   Environment
-   Start time
-   Duration
-   Filters

### Filters

-   Active / Resolved
-   Critical / High / Medium / Low
-   Service
-   Environment
-   Time

### Navigation

``` text
Health & Incidents
└── Incident → Incident Details
```

------------------------------------------------------------------------

# 20. Incident Details

## Purpose

Provide a complete investigation context for an incident.

### Must contain

#### Header

-   Incident title
-   Severity
-   Status
-   Start time
-   Duration
-   Affected services

#### Summary

What is happening?

#### Impact

What users/services are affected?

#### Timeline

What happened and when?

#### Evidence

-   Logs
-   Metrics
-   Traces where supported
-   Events
-   Alerts

#### Correlations

-   Related services
-   Infrastructure events
-   Deployments
-   Dependencies
-   Other anomalies

#### AI analysis

-   Observation
-   Evidence
-   Possible explanation
-   Confidence
-   Suggested investigation/action

#### Actions

Relevant investigation or remediation actions.

### Navigation

``` text
Incident Details
├── Back → Health & Incidents
├── View Service → Service Details
├── View Deployment → Deployment Details
├── View Logs → Logs
├── View Metrics → Metrics
├── View Dependency → Dependency Map
└── AI Investigation → AI / Insights
```

------------------------------------------------------------------------

# 21. Services

## Purpose

Provide a service catalogue for the selected project.

### Must contain

-   Service name
-   Health
-   Availability
-   Traffic
-   Error state
-   Environment
-   Active incidents

Example:

``` text
Frontend       🟢
API            🟢
Auth           🟢
Payments       🟡
Database       🟢
Redis          🟢
```

### Navigation

``` text
Services
└── Select Service → Service Details
```

------------------------------------------------------------------------

# 22. Service Details

## Purpose

Provide operational visibility into one service.

### Must contain

#### Health

-   Current status
-   Availability

#### Performance

-   Traffic
-   Latency
-   Errors
-   CPU
-   Memory

#### Dependencies

Examples:

``` text
API → PostgreSQL
API → Redis
API → Stripe
```

#### Logs

Relevant service logs.

#### Events

-   Deployments
-   Restarts
-   Configuration changes
-   Failures

#### Incidents

Active and historical incidents.

### Navigation

``` text
Service Details
├── Back → Services
├── View Logs → Logs
├── View Metrics → Metrics
├── View Incident → Incident Details
├── View Deployment → Deployment Details
└── View Dependency → Dependency Map
```

------------------------------------------------------------------------

# 23. Infrastructure

## Purpose

Monitor infrastructure resources.

### Resource categories

-   Servers
-   Hosts
-   VMs
-   Containers
-   Cloud resources

### Must contain

-   Resource health
-   CPU
-   Memory
-   Disk
-   Network
-   Availability
-   Active issues

### Navigation

``` text
Infrastructure
└── Resource → Resource Details
```

A dedicated resource-detail page may be introduced when the
implementation requires it.

------------------------------------------------------------------------

# 24. Kubernetes

## Purpose

Provide Kubernetes-specific monitoring and troubleshooting.

### Hierarchy

``` text
Cluster
  ↓
Namespace
  ↓
Workload
  ↓
Pod
  ↓
Container
```

### Must contain

-   Cluster health
-   Node health
-   Namespaces
-   Deployments
-   Replica status
-   Pods
-   Restart counts
-   CPU
-   Memory
-   Events
-   Scheduling failures
-   Image/pull failures

### Navigation

``` text
Kubernetes
├── Cluster
├── Namespace
├── Workload
├── Pod
└── Container
```

Detailed Kubernetes entity screens should be introduced as needed
without changing the main navigation model.

------------------------------------------------------------------------

# 25. Logs

## Purpose

Provide centralized investigation evidence.

### Must contain

-   Search
-   Time range
-   Severity
-   Service
-   Host/container
-   Structured-field filters
-   Log entries
-   Expand entry
-   Copy
-   Incident/time correlation

### Navigation

``` text
Logs
├── Open Log Entry → Log Drawer
├── Filter Service → Service Details
├── Related Incident → Incident Details
└── Related Deployment → Deployment Details
```

A log entry should generally open in a contextual drawer rather than
creating a full page.

------------------------------------------------------------------------

# 26. Metrics

## Purpose

Provide time-series operational data.

### Must contain

-   CPU
-   Memory
-   Disk
-   Network
-   Requests
-   Response time
-   Error rate
-   Throughput

### Required controls

-   Time range
-   Metric selector
-   Service/resource selector
-   Threshold display where applicable

### Navigation

``` text
Metrics
├── Filter Service → Service Details
├── Related Incident → Incident Details
└── Related Resource → Infrastructure / Kubernetes
```

------------------------------------------------------------------------

# 27. Alerts & Rules

## Purpose

Manage monitoring conditions and alerts.

### Must contain

-   Active alerts
-   Alert rules
-   Status
-   Trigger history
-   Affected service
-   Severity
-   Notification configuration

### Example rules

``` text
CPU > 80%
Memory > 90%
Error rate > 5%
Latency > 2 sec
Service unavailable
Pod crash looping
Database unavailable
```

### Navigation

``` text
Alerts & Rules
├── Create Alert → Alert Configuration
├── Select Alert → Alert Details
└── Select Rule → Alert Rule Details
```

------------------------------------------------------------------------

# 28. Alert Details

## Must contain

-   Alert condition
-   Current state
-   Trigger history
-   Affected service
-   Related incident
-   Notifications
-   Resolution state

### Navigation

``` text
Alert Details
├── Back → Alerts & Rules
├── Related Incident → Incident Details
└── Affected Service → Service Details
```

------------------------------------------------------------------------

# 29. Deployments

## Purpose

Track application deployment history and connect deployments to runtime
behavior.

### Must contain

-   Version
-   Commit
-   Branch
-   Status
-   Deployment time
-   Environment
-   Author

Example:

``` text
v1.8.2   🟢   10:31
v1.8.1   🟢   Yesterday
v1.8.0   🔴   Yesterday
```

### Important relationship

The system should eventually correlate:

``` text
Deployment
     ↓
Runtime change
     ↓
Metric anomaly
     ↓
Incident
```

### Navigation

``` text
Deployments
└── Select Deployment → Deployment Details
```

------------------------------------------------------------------------

# 30. Deployment Details

## Must contain

-   Version
-   Commit
-   Branch
-   Author
-   Deployment time
-   Build status
-   Deployment status
-   Logs
-   Changed files where available
-   Related incidents
-   Rollback action where supported

### Navigation

``` text
Deployment Details
├── Back → Deployments
├── Logs → Deployment Logs
├── Incident → Incident Details
├── Service → Service Details
└── Rollback → Confirmation Modal
```

------------------------------------------------------------------------

# 31. Dependency Map

## Purpose

Visualize relationships between application services and infrastructure.

Example:

``` text
                Stripe
                   │
                   ↓
Frontend → API → PostgreSQL
            │
            ↓
          Redis
```

Infrastructure relationships may extend the graph:

``` text
API
 ↓
Pod
 ↓
Node
 ↓
Cluster
```

### Navigation

Entities in the dependency graph should be clickable.

``` text
Dependency Map
├── Service → Service Details
├── Database → Resource Details
├── Pod → Kubernetes
├── Node → Infrastructure
└── Incident → Incident Details
```

This can become one of the platform's signature investigation screens.

------------------------------------------------------------------------

# 32. Security & Code Quality

## Purpose

Provide security and code-quality visibility alongside runtime context.

Potential integrations:

-   Trivy
-   SonarQube
-   Dependency scanning
-   Secret detection
-   Container vulnerability scanning

### Important product relationship

Security findings should eventually connect to runtime entities:

``` text
Vulnerability
     ↓
Affected dependency
     ↓
Affected service
     ↓
Production deployment
     ↓
Runtime impact
```

### Navigation

``` text
Security & Code Quality
├── Vulnerability Details
├── Code Quality Details
├── Affected Service → Service Details
└── Related Deployment → Deployment Details
```

------------------------------------------------------------------------

# 33. AI / Insights

## Purpose

Provide AI-assisted analysis of monitoring data.

### Must contain

-   Detected anomalies
-   Correlations
-   Incident summaries
-   Possible causes
-   Supporting evidence
-   Confidence
-   Suggested investigation/action

Example:

``` text
Possible root cause

API deployment v1.8.2 may have introduced
increased database queries.

Evidence

✓ Deployment occurred 8 min ago
✓ DB queries increased 42%
✓ API latency increased 31%
✓ PostgreSQL CPU increased 27%
```

### AI must distinguish

``` text
Observation
    ↓
Evidence
    ↓
Interpretation
    ↓
Confidence
    ↓
Suggested action
```

AI output must not be presented as raw telemetry.

### Navigation

``` text
AI / Insights
├── Incident → Incident Details
├── Service → Service Details
├── Deployment → Deployment Details
├── Metric → Metrics
└── Log → Logs
```

------------------------------------------------------------------------

# 34. Reports

## Purpose

Provide historical and operational summaries.

Potential reports:

-   Daily health report
-   Incident report
-   Deployment report
-   Security report
-   Availability report

### Export formats

Potentially:

-   PDF
-   CSV
-   JSON

### Navigation

``` text
Reports
└── Select Report → Report Details
```

------------------------------------------------------------------------

# 35. Project Settings

Settings belong to the selected project.

## Sections

``` text
Project Settings
├── General
├── Repository
├── Deployment
├── Environment
├── Monitoring
├── Health Checks
├── Notifications
└── Danger Zone
```

### Navigation

Settings pages should remain inside the settings area.

------------------------------------------------------------------------

# 36. Integrations

## Purpose

Connect external systems.

Potential integrations:

-   GitHub
-   GitLab
-   Docker
-   Kubernetes
-   AWS
-   Terraform
-   Slack
-   Email
-   PagerDuty

### Navigation

``` text
Settings
└── Integrations
      ├── Connect Integration
      └── Integration Details
```

------------------------------------------------------------------------

# 37. Team & Access

## Purpose

Manage users and project access.

### Must contain

-   Members
-   Roles
-   Invitations
-   Access status

Potential roles:

-   Owner
-   Admin
-   DevOps
-   Developer
-   Viewer

### Navigation

``` text
Team & Access
├── Invite Member → Invite Modal
├── Member → Member Details
└── Role → Role Configuration
```

------------------------------------------------------------------------

# 38. Secrets Management

## Purpose

Manage sensitive project configuration securely.

### Must contain

-   Secret name
-   Environment
-   Created/updated information
-   Masked value
-   Rotation/update action

Never display the actual secret value by default.

### Navigation

``` text
Secrets
├── Add Secret → Secret Modal
├── Edit Secret → Secret Modal
└── Delete Secret → Confirmation Modal
```

------------------------------------------------------------------------

# 39. Notifications

## Purpose

Configure where operational notifications are delivered.

### Channels

-   Email
-   Slack
-   Webhook
-   PagerDuty

### Rules

Example:

``` text
Critical incident → Slack + Email
Warning → Slack
Resolved incident → Slack
```

### Navigation

``` text
Notifications
├── Channel Configuration
└── Notification Rule
```

------------------------------------------------------------------------

# 40. Audit Log

## Purpose

Record important project/account actions.

Example:

``` text
10:31  User created project
10:34  GitHub repository connected
10:42  Monitoring enabled
11:02  Alert rule created
11:17  Deployment detected
```

### Must contain

-   Timestamp
-   Actor
-   Action
-   Resource
-   Result

Audit logs should generally be read-only.

------------------------------------------------------------------------

# 41. User Profile / Account

## Purpose

Manage the authenticated user's personal account.

### Sections

-   Profile
-   Password
-   Preferences
-   Theme
-   Account

This is global account configuration, not project configuration.

------------------------------------------------------------------------

# 42. Page vs Drawer vs Modal Rules

Not every interaction should navigate to a new page.

## Use a full page for

-   Dashboard
-   Health & Incidents
-   Incident Details
-   Services
-   Service Details
-   Infrastructure
-   Kubernetes
-   Logs
-   Metrics
-   Alerts
-   Alert Details
-   Deployments
-   Deployment Details
-   Dependencies
-   Security
-   AI Insights
-   Reports
-   Settings

## Use a drawer for

-   Log details
-   Quick resource details
-   Contextual telemetry
-   Supporting evidence
-   Secondary investigation information

## Use a modal for

-   Add environment variable
-   Add secret
-   Invite member
-   Create alert
-   Confirm destructive action
-   Small configuration actions

## Use a wizard for

-   Add Project

------------------------------------------------------------------------

# 43. Primary Sidebar

The authenticated project sidebar should conceptually be:

``` text
PROJECT
├── Project Switcher
└── Dashboard

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

The exact labels may evolve, but the grouping should remain stable.

------------------------------------------------------------------------

# 44. Breadcrumb Rules

Use breadcrumbs when the user is inside a deep hierarchy.

Example:

``` text
ShopEasy
/
Services
/
API
```

For an incident:

``` text
ShopEasy
/
Health & Incidents
/
API Latency Increased
```

For Kubernetes:

``` text
ShopEasy
/
Kubernetes
/
Production
/
API Deployment
/
Pod
```

Breadcrumbs should reflect actual navigation hierarchy rather than
arbitrary page names.

------------------------------------------------------------------------

# 45. Cross-Entity Navigation

The platform's strongest UX should come from linking related entities.

## Incident → Service

``` text
Incident
 ↓
Affected Service
```

## Incident → Deployment

``` text
Incident
 ↓
Possible related deployment
```

## Incident → Logs

``` text
Incident
 ↓
Relevant logs around incident start
```

## Incident → Metrics

``` text
Incident
 ↓
Relevant metric window
```

## Service → Dependencies

``` text
Service
 ↓
Dependency Map
```

## Deployment → Incident

``` text
Deployment
 ↓
Incidents shortly after deployment
```

## Security → Service

``` text
Security finding
 ↓
Affected service
```

## Kubernetes → Infrastructure

``` text
Pod
 ↓
Node
 ↓
Cluster
```

This cross-linking is central to the product's investigation experience.

------------------------------------------------------------------------

# 46. Recommended Core Routes

The exact frontend framework may differ, but the application should
conceptually maintain routes similar to:

``` text
/
/features
/how-it-works
/docs

/login
/register
/verify-email
/forgot-password
/reset-password

/projects

/projects/new
/projects/new/basics
/projects/new/repository
/projects/new/analysis
/projects/new/deployment
/projects/new/environment
/projects/new/runtime
/projects/new/dependencies
/projects/new/health
/projects/new/review
/projects/new/complete

/projects/:projectId

/projects/:projectId/incidents
/projects/:projectId/incidents/:incidentId

/projects/:projectId/services
/projects/:projectId/services/:serviceId

/projects/:projectId/infrastructure

/projects/:projectId/kubernetes

/projects/:projectId/logs
/projects/:projectId/metrics

/projects/:projectId/alerts
/projects/:projectId/alerts/:alertId

/projects/:projectId/deployments
/projects/:projectId/deployments/:deploymentId

/projects/:projectId/dependencies

/projects/:projectId/security

/projects/:projectId/insights

/projects/:projectId/reports

/projects/:projectId/settings
/projects/:projectId/settings/integrations
/projects/:projectId/settings/team
/projects/:projectId/settings/secrets
/projects/:projectId/settings/notifications
/projects/:projectId/settings/audit
```

The implementation does not have to use these exact URL paths, but the
logical hierarchy should remain equivalent.

------------------------------------------------------------------------

# 47. Complete User Journey

The primary first-time user journey is:

``` text
Landing
  ↓
Register
  ↓
Email Verification
  ↓
Projects Home
  ↓
Add Project
  ↓
Project Basics
  ↓
Repository Connection
  ↓
Repository Analysis
  ↓
Deployment Configuration
  ↓
Environment & Secrets
  ↓
Runtime Configuration
  ↓
Dependencies
  ↓
Health Monitoring
  ↓
Review & Connect
  ↓
Setup Complete
  ↓
Project Dashboard
```

------------------------------------------------------------------------

# 48. Normal Returning User Journey

A returning user should have a much shorter path:

``` text
Login
  ↓
Projects Home
  ↓
Select Project
  ↓
Project Dashboard
```

If a project is already selected or a deep link exists:

``` text
Login
  ↓
Requested Project / Screen
```

Do not force returning users through onboarding.

------------------------------------------------------------------------

# 49. Incident Investigation Journey

The intended operational journey is:

``` text
Project Dashboard
       ↓
Active Incident
       ↓
Incident Details
       ↓
Understand Impact
       ↓
Timeline
       ↓
Evidence
       ├── Logs
       ├── Metrics
       ├── Events
       └── Alerts
       ↓
Correlations
       ├── Service
       ├── Deployment
       ├── Dependency
       └── Infrastructure
       ↓
AI Analysis
       ↓
Suggested Investigation / Action
```

This flow should be easy to traverse without losing context.

------------------------------------------------------------------------

# 50. Deployment Investigation Journey

``` text
Deployments
     ↓
Deployment Details
     ↓
Deployment Logs
     ↓
Changed Files / Commit
     ↓
Related Service
     ↓
Metrics
     ↓
Incident
```

A deployment should be treated as a potentially important event in the
system's operational timeline.

------------------------------------------------------------------------

# 51. Dependency Investigation Journey

``` text
Service
   ↓
Dependency Map
   ↓
Dependency
   ↓
Health / Metrics
   ↓
Related Incidents
   ↓
Infrastructure
```

------------------------------------------------------------------------

# 52. Kubernetes Investigation Journey

``` text
Kubernetes
   ↓
Cluster
   ↓
Namespace
   ↓
Workload
   ↓
Pod
   ↓
Container
   ↓
Logs / Events / Metrics
   ↓
Incident
```

------------------------------------------------------------------------

# 53. Security Investigation Journey

``` text
Security & Code Quality
        ↓
Finding
        ↓
Affected Dependency
        ↓
Affected Service
        ↓
Deployment
        ↓
Runtime Context
        ↓
Incident / Impact
```

The long-term goal is to connect static security findings with runtime
operational context.

------------------------------------------------------------------------

# 54. Project Switch Flow

At any point inside the authenticated application:

``` text
Current Project
      ↓
Project Switcher
      ↓
Select Different Project
      ↓
New Project Dashboard
```

The selected project context must update consistently across:

-   Header
-   Sidebar
-   Breadcrumbs
-   Data queries
-   Filters
-   URLs/routes
-   Page titles

------------------------------------------------------------------------

# 55. Global Search Flow

``` text
Any Project Screen
       ↓
Ctrl/Cmd + K
       ↓
Search
       ↓
Entity Results
       ↓
Select Entity
       ↓
Entity Detail Screen
```

Search should never silently change project context without making that
change clear.

------------------------------------------------------------------------

# 56. Navigation State Rules

Every major page must support appropriate:

### Loading state

The user understands that data is being retrieved.

### Empty state

The user understands why there is no data and what they can do.

### Error state

The user understands what failed and whether retry is possible.

### Permission state

If a user lacks access, clearly explain that the resource is unavailable
to them.

### Not found state

If an entity no longer exists, explain what happened and provide a
useful navigation path.

------------------------------------------------------------------------

# 57. Navigation Rules for LLM Agents

Any LLM adding or modifying a page must follow these rules.

## Rule 1 --- Check this document first

Before creating a new page, determine whether the requested
functionality already belongs to an existing screen.

Do not create duplicate pages.

------------------------------------------------------------------------

## Rule 2 --- Determine the correct hierarchy

Every new page must belong to one of:

-   Public
-   Authentication
-   Global project management
-   Project operational area
-   Project settings
-   Account

------------------------------------------------------------------------

## Rule 3 --- Prefer extending an existing screen

If the new feature is contextual, consider:

-   Existing page section
-   Tab
-   Drawer
-   Modal
-   Detail view

before creating a new top-level page.

------------------------------------------------------------------------

## Rule 4 --- Do not add random sidebar items

New functionality should only become a sidebar item if it represents a
major persistent product area.

------------------------------------------------------------------------

## Rule 5 --- Preserve project context

Project-specific screens must receive and preserve the current
`projectId` or equivalent project context.

------------------------------------------------------------------------

## Rule 6 --- Every new page needs a defined entry point

Before implementing a page, define:

``` text
Where does the user enter this page from?
```

------------------------------------------------------------------------

## Rule 7 --- Every new page needs an exit path

Define:

``` text
Where can the user go next?
```

At minimum:

-   Back
-   Parent section
-   Relevant related entities

------------------------------------------------------------------------

## Rule 8 --- Connect related entities

If a screen references another entity, make the relationship navigable
where useful.

------------------------------------------------------------------------

## Rule 9 --- Avoid navigation dead ends

No operational page should leave the user stranded.

------------------------------------------------------------------------

## Rule 10 --- Keep operational and configuration workflows separate

Do not put project configuration forms inside the main operational
dashboard unless the configuration is directly necessary to the
workflow.

------------------------------------------------------------------------

# 58. When Adding a New Screen

Before adding a new screen, an LLM/developer should answer:

``` text
1. What user problem does this screen solve?

2. Which existing page owns this functionality?

3. Is this a page, detail page, drawer, modal, or wizard step?

4. What is the parent route?

5. What route should represent it?

6. What page links to it?

7. What pages can it link to?

8. What project context does it require?

9. What data/entity does it represent?

10. Does an existing screen already provide this capability?
```

Only after answering these questions should a new screen be introduced.

------------------------------------------------------------------------

# 59. Screen Naming Convention

Use names that describe the user's mental model, not implementation
details.

Preferred:

-   `Project Dashboard`
-   `Incident Details`
-   `Service Details`
-   `Deployment Details`
-   `Health & Incidents`

Avoid:

-   `MonitoringPage2`
-   `DataView`
-   `ServiceScreen`
-   `NewDashboard`
-   `ComponentPage`

Route/entity names should remain consistent with the product
terminology.

------------------------------------------------------------------------

# 60. Current Navigation Source of Truth

The following structure should be treated as the default canonical
navigation:

``` text
PUBLIC
├── Landing
├── Features
├── How It Works
└── Documentation

AUTH
├── Login
├── Register
├── Email Verification
├── Forgot Password
└── Reset Password

GLOBAL
└── Projects Home
    └── Add Project Wizard

PROJECT
├── Dashboard
├── Health & Incidents
│   └── Incident Details
├── Services
│   └── Service Details
├── Infrastructure
├── Kubernetes
├── Logs
├── Metrics
├── Alerts & Rules
│   └── Alert Details
├── Deployments
│   └── Deployment Details
├── Dependencies
├── Security & Code Quality
├── AI / Insights
└── Reports

SETTINGS
├── Project Settings
├── Integrations
├── Team & Access
├── Secrets
├── Notifications
└── Audit Log

ACCOUNT
└── User Profile / Account
```

------------------------------------------------------------------------

# 61. Relationship to `Design.md`

This document and `Design.md` have different responsibilities.

## `Product-Information-Architecture.md`

Answers:

> **What exists and how does it connect?**

It defines:

-   Pages
-   Screens
-   Routes
-   Navigation
-   User flows
-   Entity relationships
-   Page responsibilities
-   Page-to-page transitions

## `Design.md`

Answers:

> **How should it look and behave?**

It defines:

-   Visual language
-   Colors
-   Typography
-   Spacing
-   Components
-   Accessibility
-   Charts
-   Status design
-   AI visual treatment
-   Responsive behavior
-   Motion
-   UI quality rules

### When building a page

An LLM should consult **both**:

``` text
Product-Information-Architecture.md
              +
          Design.md
              ↓
        Implement Page
```

------------------------------------------------------------------------

# 62. Final Product Navigation Model

The entire product can be understood as:

``` text
                           USER
                             │
                             ↓
                          PROJECTS
                             │
                   ┌─────────┴─────────┐
                   │                   │
              Add Project         Select Project
                   │                   │
                   ↓                   ↓
             Setup Wizard       Project Dashboard
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
         OBSERVE                    OPERATE                    INTELLIGENCE
            │                          │                          │
     ┌──────┼──────┐             ┌─────┼─────┐                  │
     │      │      │             │     │     │                  │
   Health Services Infra       Alerts Deploy Dependencies       AI
     │             │             │     │     │                  │
 Incidents      Kubernetes      Rules Deployments Map            │
     │             │             │     │     │                  │
     └──────┬──────┴─────────────┴─────┴─────┴──────────────────┘
            │
            ↓
        INVESTIGATE
            │
      ┌─────┼──────────┐
      │     │          │
    Logs  Metrics   Evidence
      │     │          │
      └─────┼──────────┘
            ↓
        UNDERSTAND
            │
       AI / Correlation
            ↓
          ACT
            │
      Resolve / Configure /
      Deploy / Remediate
```

The product should always make this operational loop easy:

> **Observe → Detect → Investigate → Understand → Act → Verify**

That loop is the core navigation philosophy of the platform.
