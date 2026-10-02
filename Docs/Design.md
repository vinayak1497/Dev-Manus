# Design System & UI/UX Specification

## Intelligent Application & Infrastructure Monitoring Platform

**Document:** `Design.md`\
**Status:** Living design specification\
**Audience:** Developers, UI/UX designers, LLM coding/design agents,
reviewers\
**Purpose:** Single source of truth for the visual language, interaction
patterns, information architecture, and UX constraints of the monitoring
platform.

------------------------------------------------------------------------

## 1. Product Design Context

This project is an intelligent DevOps monitoring platform designed to
help software teams:

> **Monitor. Detect. Prevent. Keep your applications healthy.**

The system monitors applications, services, infrastructure, containers,
Kubernetes workloads, APIs, databases, logs, metrics, and related
operational signals; detects abnormal behaviour and failures; presents
incidents clearly; and can use AI-assisted analysis to help engineers
understand what happened and what action may be appropriate.

The interface must communicate:

-   Reliability
-   Operational confidence
-   Technical precision
-   Clarity under pressure
-   Observability
-   Fast incident comprehension
-   Actionability
-   Trustworthy AI assistance

The product is an engineering/operations platform, not a consumer social
application. Visual decisions should therefore prioritize information
hierarchy, signal-to-noise ratio, predictable interaction,
accessibility, and operational usability over decorative visual effects.

------------------------------------------------------------------------

# 2. Core Design Philosophy

## 2.1 Design principles

### 1. Clarity over decoration

Every visual element should help the user understand system state,
navigate, investigate, or act.

### 2. Signal over noise

Monitoring products can contain large amounts of information. Important
failures must visually dominate normal/background information.

### 3. Progressive disclosure

Do not expose every technical detail immediately.

Use:

**Overview → Detection → Investigation → Evidence → Root cause →
Action**

### 4. Status must be understandable instantly

A user should be able to identify:

-   What is healthy?
-   What is degraded?
-   What has failed?
-   What needs attention?
-   How severe is it?
-   When did it start?
-   What is affected?

without opening multiple pages.

### 5. AI should assist, not dominate

AI-generated insights should be clearly identifiable but must not
visually overpower actual system telemetry.

### 6. Consistency is reliability

Navigation, buttons, cards, status indicators, tables, charts, alerts,
and interactions should behave consistently throughout the product.

### 7. Color is a semantic system

Colors have defined meanings and must not be used randomly.

### 8. Accessibility is part of the design

System status must never be communicated through color alone.

------------------------------------------------------------------------

# 3. Visual Direction

The product uses a **professional enterprise light theme** inspired by
established enterprise design systems such as:

-   Google Material
-   IBM Carbon
-   Microsoft Fluent
-   GitHub Primer

The result should feel like a mature engineering platform rather than a
student dashboard or generic SaaS template.

## Desired visual characteristics

-   Clean
-   Professional
-   Technical
-   Spacious but information-dense
-   Modern
-   Precise
-   Calm during normal operation
-   Visually urgent during incidents
-   Strong hierarchy
-   Subtle elevation
-   Restrained animation

Avoid:

-   Excessive gradients
-   Glassmorphism everywhere
-   Neon cyberpunk styling
-   Excessive rounded cards
-   Decorative illustrations inside operational dashboards
-   Excessive shadows
-   Unnecessary animations
-   Low-contrast text
-   Dashboard clutter
-   Random colors

------------------------------------------------------------------------

# 4. Brand Color System

The project's approved base palette is:

  Semantic Role        Color             Hex
  -------------------- ----------------- -----------
  Primary / Brand      Deep Azure Blue   `#155EEF`
  Primary Hover        Dark Blue         `#1047C7`
  Primary Light        Pale Blue         `#E8F0FE`
  Secondary            Teal              `#0F766E`
  Page Background      Cool White        `#F8FAFC`
  Cards / Surface      White             `#FFFFFF`
  Border               Slate Gray        `#CBD5E1`
  Primary Text         Navy Black        `#0F172A`
  Secondary Text       Slate             `#475569`
  Healthy / Success    Green             `#15803D`
  Warning              Amber             `#B45309`
  Critical / Failure   Red               `#B42318`
  Information          Blue              `#0369A1`
  AI / Insights        Violet            `#7C3AED`

These colors are part of the project's source design specification. Do
not replace them with arbitrary colors without an explicit design
decision.

## 4.1 Color semantics

### Blue --- Product interaction

Use for:

-   Primary actions
-   Navigation selection
-   Links
-   Focus states
-   Interactive controls
-   Product branding
-   Selected filters

Blue represents trust and reliability.

### Green --- Healthy

Use for:

-   Healthy services
-   Successful checks
-   Operational systems
-   Recovered incidents
-   Positive system state

### Amber --- Warning

Use for:

-   Degraded systems
-   Elevated latency
-   Approaching thresholds
-   Warning-level incidents
-   Non-critical anomalies

### Red --- Critical

Use for:

-   Active failures
-   Critical incidents
-   Service outages
-   Failed checks
-   Severe resource exhaustion

### Violet --- AI

Use specifically for:

-   AI-generated insights
-   AI explanations
-   Root-cause assistance
-   Suggested remediation
-   AI summaries

AI should have a recognizable visual identity without being confused
with health status.

### Teal --- Secondary technical information

Use sparingly for:

-   Secondary product accents
-   Supporting technical categories
-   Secondary visual emphasis

------------------------------------------------------------------------

# 5. Accessibility and Color Rules

The UI must not communicate system state using color alone.

Every state should combine color with at least one of:

-   Icon
-   Text label
-   Shape
-   Pattern
-   Status badge
-   Tooltip
-   Explicit numeric value

Examples:

**Correct**

`● Healthy`

**Incorrect**

A green circle with no label.

Likewise:

`▲ Warning`

`✕ Critical`

should remain understandable even if the user cannot distinguish colors.

Text and interactive controls must maintain sufficient contrast against
their backgrounds.

Focus states must remain clearly visible for keyboard users.

------------------------------------------------------------------------

# 6. Typography

Typography should be clean, technical, and highly readable.

## Hierarchy

Use a clear hierarchy:

-   Display / Hero heading
-   Page heading
-   Section heading
-   Card heading
-   Body text
-   Secondary text
-   Metadata
-   Labels
-   Code / telemetry values

Recommended principle:

> Use typography to create hierarchy before using color or decoration.

## Suggested typography behavior

### Hero

Large, bold, confident.

### Page title

Strong but compact.

### Section title

Medium-to-bold.

### Body

Comfortable reading size and line height.

### Metadata

Smaller, muted, but still accessible.

### Monospace

Use for:

-   Logs
-   Commands
-   Request IDs
-   IP addresses
-   Container IDs
-   Hashes
-   Stack traces
-   Code
-   Technical identifiers

Do not use monospace for ordinary UI text.

------------------------------------------------------------------------

# 7. Spacing System

Use a consistent spacing scale rather than arbitrary margins.

Preferred base unit:

**4px**

Typical values:

-   4px --- micro spacing
-   8px --- tight spacing
-   12px --- compact spacing
-   16px --- standard spacing
-   24px --- component spacing
-   32px --- section spacing
-   48px --- major section spacing
-   64px+ --- page-level spacing

The interface should feel spacious without wasting screen area in
operational views.

------------------------------------------------------------------------

# 8. Border Radius

Use restrained enterprise-style rounding.

Recommended:

-   Small controls: `6px`
-   Inputs/buttons: `6–8px`
-   Cards: `8–12px`
-   Large containers: `12–16px`

Avoid excessively rounded "pill" designs unless the element is genuinely
a badge, filter, or compact status indicator.

------------------------------------------------------------------------

# 9. Elevation and Shadows

Prefer borders and subtle elevation over heavy shadows.

Cards should generally use:

-   White surface
-   Light slate border
-   Very subtle shadow where necessary

Do not make every component look like a floating object.

Hierarchy should come primarily from:

1.  Position
2.  Spacing
3.  Typography
4.  Border
5.  Background
6.  Subtle elevation

------------------------------------------------------------------------

# 10. Information Architecture

The application should be organized around the operational workflow.

Recommended primary navigation:

1.  **Overview**
2.  **Applications**
3.  **Infrastructure**
4.  **Kubernetes**
5.  **Incidents**
6.  **Logs**
7.  **Metrics**
8.  **Alerts**
9.  **AI Insights**
10. **Settings**

The exact navigation can evolve with implementation, but the information
architecture should preserve a clear distinction between:

-   Observing
-   Detecting
-   Investigating
-   Understanding
-   Acting
-   Configuring

------------------------------------------------------------------------

# 11. Application Shell

The authenticated application should use a persistent enterprise
dashboard shell.

## Left sidebar

Contains:

-   Product logo
-   Workspace/project selector if required
-   Primary navigation
-   Incident/alert indicators
-   Settings
-   User/profile area

The sidebar may support:

-   Expanded mode
-   Collapsed/icon mode

The current section must always be visually obvious.

## Top bar

May contain:

-   Page title/breadcrumb
-   Environment selector
-   Global search
-   Time range selector
-   Refresh status
-   Notifications
-   User menu

Avoid putting too many controls into the top bar.

------------------------------------------------------------------------

# 12. Landing Page

The public landing page communicates the product value before
authentication.

Primary message:

> **Monitor. Detect. Prevent. Keep your applications healthy.**

## Landing page structure

### 12.1 Hero

Purpose:

Immediately explain:

-   What the product does
-   Who it is for
-   Why it matters

The hero should contain:

-   Strong headline
-   Concise supporting statement
-   Primary CTA
-   Secondary CTA where appropriate
-   Product/dashboard visual

The product UI itself should be the visual proof of the product.

### 12.2 How it works

Explain the operational flow:

**Connect → Monitor → Detect → Investigate → Prevent**

Keep this simple and visual.

### 12.3 What can be monitored

Show the breadth of the platform, such as:

-   Applications
-   APIs
-   Servers
-   Containers
-   Kubernetes
-   Databases
-   Infrastructure
-   Logs
-   Metrics
-   Services

### 12.4 Failure detection

Explain that the system can identify abnormal conditions such as:

-   Application failures
-   API failures
-   Availability problems
-   Resource exhaustion
-   High latency
-   Error-rate spikes
-   Container failures
-   Kubernetes workload issues
-   Infrastructure degradation
-   Dependency-related failures

### 12.5 Infrastructure monitoring

Demonstrate visibility into:

-   CPU
-   Memory
-   Disk
-   Network
-   Nodes
-   Containers
-   Workloads
-   Services

### 12.6 AI-assisted investigation

Present AI as an operational assistant that can help:

-   Summarize incidents
-   Correlate signals
-   Explain anomalies
-   Identify likely contributing factors
-   Suggest investigation/remediation steps

Do not claim certainty where the system only has an inference.

------------------------------------------------------------------------

# 13. Dashboard Design

The main dashboard should answer:

> **"Is everything okay, and if not, what should I look at first?"**

## Recommended dashboard hierarchy

### Row 1 --- Global health

High-level KPI cards:

-   Overall system health
-   Active incidents
-   Critical alerts
-   Monitored services
-   Availability
-   Current error rate

### Row 2 --- Operational trends

Charts:

-   Request volume
-   Error rate
-   Latency
-   CPU
-   Memory
-   Availability

### Row 3 --- Active problems

Incident table/list:

-   Severity
-   Incident
-   Service
-   Started
-   Duration
-   Status
-   Affected components

### Row 4 --- Infrastructure

Infrastructure health summary:

-   Nodes
-   Containers
-   Kubernetes workloads
-   Resource utilization

### Row 5 --- AI insights

Only when meaningful:

-   Detected anomaly
-   Correlation
-   Explanation
-   Suggested next step

------------------------------------------------------------------------

# 14. KPI Cards

KPI cards should be concise.

Structure:

**Label**

**Primary value**

**Trend/change**

**Optional status**

Example:

> API Availability\
> **99.94%**\
> ↑ 0.12% vs previous period

Do not overload KPI cards with paragraphs.

A KPI should answer one question.

------------------------------------------------------------------------

# 15. Charts and Data Visualization

Charts exist to support operational decisions.

Preferred chart types:

-   Line chart --- trends over time
-   Area chart --- volume/resource utilization
-   Bar chart --- comparison
-   Stacked bar --- composition
-   Donut --- limited categorical distribution
-   Heatmap --- time/category intensity
-   Gauge --- use sparingly for a single bounded metric

Avoid:

-   3D charts
-   Decorative charts
-   Excessive gradients
-   Pie charts with many categories
-   Charts without units
-   Charts without time context

## Chart requirements

Every operational chart should make clear:

-   Metric name
-   Unit
-   Time range
-   Current value
-   Relevant threshold where applicable
-   Hover/tooltip details

------------------------------------------------------------------------

# 16. Monitoring Time Controls

Monitoring views should provide a consistent time-range control.

Typical choices:

-   Last 5 minutes
-   Last 15 minutes
-   Last 30 minutes
-   Last 1 hour
-   Last 6 hours
-   Last 24 hours
-   Last 7 days
-   Custom

The selected time range must be visible.

For real-time dashboards, show:

-   Last updated
-   Auto-refresh state
-   Refresh interval if configurable

------------------------------------------------------------------------

# 17. Status Model

Use a standardized system state model.

### Healthy

The monitored component is operating within expected parameters.

### Warning

The component is operating but shows elevated risk or degradation.

### Critical

The component has a severe failure or condition requiring attention.

### Unknown

The monitoring system cannot confidently determine current state.

### Maintenance

Monitoring is intentionally suppressed or the system is undergoing
planned maintenance.

### Recovering

The component is returning to healthy operation after an incident.

Do not silently map `Unknown` to `Healthy`.

------------------------------------------------------------------------

# 18. Incident Design

An incident is a first-class object.

## Incident list

Columns should prioritize:

1.  Severity
2.  Title
3.  Affected service
4.  Status
5.  Started
6.  Duration
7.  Last update

Useful filters:

-   Severity
-   Status
-   Service
-   Environment
-   Time
-   Source

## Incident detail

The incident page should provide a narrative investigation flow:

### Header

-   Incident title
-   Severity
-   Status
-   Start time
-   Duration
-   Affected services

### Summary

What is happening now?

### Impact

What users/services are affected?

### Timeline

What happened and when?

### Evidence

Relevant logs, metrics, traces, events, and alerts.

### Correlations

Related services, deployments, infrastructure events, or anomalies.

### AI analysis

AI-generated explanation and evidence references.

### Actions

Available investigation or remediation actions.

------------------------------------------------------------------------

# 19. Incident Severity

Severity must be explicit.

Suggested levels:

-   Critical
-   High
-   Medium
-   Low
-   Informational

Severity must not be represented solely through color.

Each severity should have:

-   Text
-   Icon or symbol
-   Semantic color
-   Optional numeric/internal priority

------------------------------------------------------------------------

# 20. Failure Detection UX

Detection should answer:

> **What changed?**

and then:

> **Why does it matter?**

The interface should distinguish:

### Threshold-based detection

Example:

CPU \> configured threshold.

### Anomaly detection

Example:

Request latency deviates significantly from historical behavior.

### Availability detection

Example:

Endpoint stops responding.

### Dependency detection

Example:

Application errors increase after a database/service dependency becomes
unavailable.

### Infrastructure detection

Example:

Node resource exhaustion or container restart behavior.

Detection results should show evidence rather than simply declaring a
failure.

------------------------------------------------------------------------

# 21. Application Monitoring

An application detail page may contain:

### Overview

-   Health
-   Availability
-   Requests
-   Errors
-   Latency
-   Active alerts

### Dependencies

Visualize relationships between:

**Application → API → Service → Database / Infrastructure**

### Metrics

-   Request rate
-   Error rate
-   Response time
-   Throughput
-   Resource consumption

### Logs

Filterable application logs.

### Events

-   Deployments
-   Restarts
-   Configuration changes
-   Failures

### Incidents

Historical and active incidents affecting the application.

------------------------------------------------------------------------

# 22. Infrastructure Monitoring

Infrastructure pages should prioritize operational health.

Monitor:

-   Hosts
-   CPU
-   Memory
-   Disk
-   Network
-   Processes
-   Containers
-   Node availability

Use a combination of:

-   Health summary
-   Time-series charts
-   Resource tables
-   Threshold indicators
-   Historical trends

Avoid presenting every metric simultaneously.

------------------------------------------------------------------------

# 23. Kubernetes Monitoring

Kubernetes is a major infrastructure domain and should have dedicated
visibility.

Recommended hierarchy:

**Cluster → Namespace → Workload → Pod → Container**

Useful signals:

-   Cluster health
-   Node health
-   Namespace activity
-   Deployment status
-   Replica status
-   Pod status
-   Restart counts
-   CPU
-   Memory
-   Events
-   Scheduling failures
-   Image/pull failures

Use familiar Kubernetes terminology.

The UI should help engineers move from:

> "Something is wrong"

to:

> "This workload is unhealthy"

to:

> "This pod/container is repeatedly restarting"

to:

> "Here is the supporting evidence."

------------------------------------------------------------------------

# 24. Logs UX

Logs are investigation evidence.

Required capabilities:

-   Search
-   Filter
-   Time range
-   Severity
-   Service
-   Host/container
-   Structured field filtering
-   Expand log entry
-   Copy
-   Correlate with incident/time

Logs should be visually dense but readable.

Use monospace typography.

Avoid excessive row height.

------------------------------------------------------------------------

# 25. Alerts UX

Alerts should distinguish between:

**Alert = signal**

and

**Incident = operational problem**

Multiple alerts may contribute to one incident.

The UI should avoid overwhelming the user with duplicate or repetitive
alerts.

Alert states can include:

-   Firing
-   Acknowledged
-   Resolved
-   Suppressed
-   Muted

------------------------------------------------------------------------

# 26. AI / Intelligent Insights

AI is a supporting intelligence layer.

## AI visual language

Use:

**Violet `#7C3AED`**

for AI-specific visual treatment.

Examples:

-   AI badge
-   AI insight card
-   AI explanation icon
-   AI-generated summary

Do not use violet for normal health status.

## AI output structure

Prefer:

### Observation

What the system detected.

### Evidence

What signals support the observation.

### Interpretation

What may explain the behavior.

### Confidence

How strongly the evidence supports the interpretation.

### Suggested action

What the engineer could investigate or do next.

AI should distinguish facts from hypotheses.

Avoid presenting speculative root causes as confirmed facts.

------------------------------------------------------------------------

# 27. AI Trust UX

Every AI-generated statement should be visually distinguishable from raw
telemetry.

Use language such as:

-   "Possible cause"
-   "Likely related"
-   "Detected correlation"
-   "Evidence suggests"
-   "Consider investigating"

Avoid unsupported absolute statements such as:

-   "This definitely caused the outage."

Where possible, provide links back to evidence:

-   Metric
-   Log
-   Event
-   Deployment
-   Alert
-   Resource

The user should be able to verify the AI's reasoning.

------------------------------------------------------------------------

# 28. Tables

Operational tables should optimize scanning.

Recommended characteristics:

-   Compact rows
-   Strong column hierarchy
-   Sticky headers for long tables
-   Sortable columns
-   Filterable columns
-   Search
-   Pagination or virtualization where necessary
-   Clear empty states
-   Clear loading states

Use status badges rather than excessive decorative icons.

Important columns should appear first.

------------------------------------------------------------------------

# 29. Forms and Configuration

Configuration pages should be conservative and predictable.

Examples:

-   Monitoring target configuration
-   Thresholds
-   Alert rules
-   Notification channels
-   Integrations
-   User settings

Use:

-   Clear labels
-   Helper text
-   Validation
-   Explicit save actions
-   Unsaved-change protection where appropriate

Dangerous/destructive actions must require explicit confirmation.

------------------------------------------------------------------------

# 30. Buttons

Use a clear hierarchy.

### Primary

For the main action on a page.

Example:

**Create Monitor**

### Secondary

For supporting actions.

Example:

**View Details**

### Tertiary / Ghost

For low-emphasis actions.

### Destructive

For actions such as:

-   Delete
-   Disable
-   Remove integration

Destructive buttons should not use the primary brand blue.

------------------------------------------------------------------------

# 31. Loading States

Never leave large blank areas while data is loading.

Use:

-   Skeleton loaders
-   Progress indicators
-   Table skeletons
-   Chart placeholders

Avoid excessive spinners.

Loading states should preserve the approximate final layout to prevent
layout shifts.

------------------------------------------------------------------------

# 32. Empty States

Empty states should explain:

1.  What is empty?
2.  Why might it be empty?
3.  What can the user do next?

Example:

> No applications are being monitored yet.\
> Connect an application to start collecting health and performance
> data.

Provide a clear CTA where appropriate.

------------------------------------------------------------------------

# 33. Error States

Errors should be actionable.

Bad:

> Error 500

Better:

> We couldn't load application metrics.\
> The monitoring service may be temporarily unavailable.\
> **Retry**

Where possible include:

-   What failed
-   Impact
-   Retry
-   Diagnostic/reference ID

------------------------------------------------------------------------

# 34. Notifications and Toasts

Use toasts for transient feedback:

-   Saved successfully
-   Monitor created
-   Configuration updated
-   Integration connected

Do not use toasts for critical incident information.

Critical operational events belong in:

-   Incident system
-   Alert system
-   Notification center

------------------------------------------------------------------------

# 35. Responsive Design

The application should support:

-   Desktop
-   Laptop
-   Tablet
-   Mobile where practical

Desktop is the primary environment for the operational dashboard because
monitoring workflows benefit from screen real estate.

At smaller widths:

-   Collapse sidebar
-   Stack cards
-   Simplify tables
-   Prioritize essential columns
-   Allow horizontal scrolling for dense technical tables where
    necessary

Do not simply shrink everything.

------------------------------------------------------------------------

# 36. Motion and Animation

Animation should communicate state or improve comprehension.

Good uses:

-   Sidebar transition
-   Modal transition
-   Chart updates
-   Incident state changes
-   Loading
-   Expand/collapse
-   Navigation transitions

Avoid:

-   Constant floating animations
-   Decorative background animations
-   Excessive parallax
-   Bouncing UI
-   Distracting live effects

Operational dashboards should remain calm.

For accessibility, respect reduced-motion preferences.

------------------------------------------------------------------------

# 37. Real-Time Data Behavior

When live data changes:

-   Do not unnecessarily shift the entire page.
-   Animate small changes subtly.
-   Highlight newly changed critical values.
-   Preserve the user's current investigation context.

For incident changes:

**New → Acknowledged → Investigating → Resolved**

should be visually understandable.

------------------------------------------------------------------------

# 38. Search

Global search should eventually support:

-   Applications
-   Services
-   Hosts
-   Containers
-   Kubernetes workloads
-   Incidents
-   Alerts
-   Logs

Search results should show the entity type.

Example:

> `payment-api`\
> Application

> `payment-api-prod`\
> Kubernetes Deployment

This avoids ambiguity.

------------------------------------------------------------------------

# 39. Notifications

Notification center may contain:

-   New critical incidents
-   Resolved incidents
-   Alert changes
-   Monitoring failures
-   Integration issues
-   AI-generated investigation insights

Notifications should be grouped and prioritized.

------------------------------------------------------------------------

# 40. Design Tokens

Implementation should centralize design tokens.

Example conceptual token structure:

``` text
color.brand.primary
color.brand.primaryHover
color.brand.primaryLight

color.status.healthy
color.status.warning
color.status.critical
color.status.info
color.ai.insight

color.background.page
color.background.surface

color.border.default

color.text.primary
color.text.secondary

spacing.1
spacing.2
spacing.3
spacing.4
...

radius.sm
radius.md
radius.lg
```

Do not hardcode the same color values throughout components.

------------------------------------------------------------------------

# 41. Component Library

Build reusable components before creating many page-specific components.

Core components should include:

-   Button
-   IconButton
-   Input
-   Select
-   Search
-   Checkbox
-   Toggle
-   Tabs
-   Badge
-   StatusBadge
-   Card
-   KPI Card
-   Alert
-   Toast
-   Modal
-   Drawer
-   Tooltip
-   Dropdown
-   Table
-   DataTable
-   Pagination
-   Chart container
-   Timeline
-   Incident card
-   AI Insight card
-   Empty state
-   Error state
-   Skeleton
-   Breadcrumb
-   Sidebar
-   Top navigation

Reusable components should have predictable states:

-   Default
-   Hover
-   Focus
-   Active
-   Disabled
-   Loading
-   Error where relevant

------------------------------------------------------------------------

# 42. Design Rules for LLM/AI Coding Agents

Any LLM modifying or generating UI for this project must follow these
rules.

## Rule 1 --- Preserve the design system

Do not introduce random colors, typography, spacing, or component
styles.

## Rule 2 --- Reuse components

Before creating a new UI component, determine whether an existing
component can be reused or extended.

## Rule 3 --- Preserve semantic colors

Do not use red, green, amber, or violet decoratively.

## Rule 4 --- Preserve health semantics

Green = healthy\
Amber = warning\
Red = critical\
Violet = AI\
Blue = interaction/product

## Rule 5 --- Do not communicate state with color alone

## Rule 6 --- Prioritize operational information

Critical system information must remain visually prominent.

## Rule 7 --- Avoid unnecessary UI

If an element does not improve understanding, navigation, investigation,
or action, question whether it is needed.

## Rule 8 --- Do not fabricate telemetry

Mock data must be clearly identifiable as mock/development data when
used.

## Rule 9 --- Do not fabricate AI certainty

AI insights should be represented as evidence-based analysis, not
guaranteed truth.

## Rule 10 --- Maintain responsive behavior

Every new page/component must have a reasonable responsive strategy.

## Rule 11 --- Maintain accessibility

Use semantic HTML, keyboard navigation, focus states, labels, sufficient
contrast, and non-color status indicators.

## Rule 12 --- Keep operational density intentional

Do not make monitoring pages unnecessarily spacious at the expense of
useful information.

------------------------------------------------------------------------

# 43. Data Integrity in the UI

The interface must distinguish:

### Actual telemetry

Data received from monitoring systems.

### Derived metrics

Calculated from telemetry.

### Detected anomaly

A system-generated interpretation.

### AI insight

An AI-generated interpretation or recommendation.

### User configuration

A human-defined threshold or rule.

These should never be visually conflated.

------------------------------------------------------------------------

# 44. Incident Investigation UX Principle

The product should support a consistent investigation journey:

``` text
Something changed
        ↓
What is affected?
        ↓
How severe is it?
        ↓
When did it start?
        ↓
What changed around that time?
        ↓
What evidence supports the failure?
        ↓
What dependencies are involved?
        ↓
What is the likely cause?
        ↓
What should I investigate or do next?
```

Every major monitoring page should help the user progress through this
flow.

------------------------------------------------------------------------

# 45. Dashboard Design Priority

When deciding what to display, use this priority order:

1.  Active critical failures
2.  Active high-severity problems
3.  Degraded systems
4.  Important anomalies
5.  Current system health
6.  Trends
7.  Historical information
8.  Configuration/details

The interface should not give equal visual weight to everything.

------------------------------------------------------------------------

# 46. Design Quality Checklist

Before considering a screen complete, verify:

### Visual

-   [ ] Correct color tokens used
-   [ ] Clear hierarchy
-   [ ] Consistent spacing
-   [ ] Appropriate typography
-   [ ] No unnecessary decoration
-   [ ] Consistent component styles

### UX

-   [ ] Primary user goal is obvious
-   [ ] Important information is easy to find
-   [ ] Actions are discoverable
-   [ ] Loading state exists
-   [ ] Empty state exists
-   [ ] Error state exists
-   [ ] Destructive actions are protected

### Monitoring

-   [ ] System state is explicit
-   [ ] Severity is explicit
-   [ ] Time context is available
-   [ ] Evidence can be accessed
-   [ ] Critical issues are visually prominent

### AI

-   [ ] AI content is clearly identified
-   [ ] AI does not look like raw telemetry
-   [ ] Evidence/hypothesis distinction is maintained
-   [ ] No unsupported certainty is presented

### Accessibility

-   [ ] Status is not conveyed by color alone
-   [ ] Keyboard navigation works
-   [ ] Focus state is visible
-   [ ] Labels are meaningful
-   [ ] Contrast is sufficient
-   [ ] Reduced motion is respected

### Responsive

-   [ ] Desktop layout works
-   [ ] Tablet behavior considered
-   [ ] Narrow viewport behavior considered
-   [ ] Tables remain usable
-   [ ] Navigation remains accessible

------------------------------------------------------------------------

# 47. Overall Design Goal

The final product should feel like a serious engineering platform used
by a professional DevOps/SRE team.

The desired user reaction is:

> **"I can immediately see what is happening, understand what is
> important, investigate the evidence, and decide what to do next."**

The interface should make complex operational data understandable
without hiding its technical depth.

The product should feel:

**Reliable. Clear. Technical. Calm. Intelligent. Actionable.**

And above all:

> **Monitor. Detect. Prevent. Keep your applications healthy.**
