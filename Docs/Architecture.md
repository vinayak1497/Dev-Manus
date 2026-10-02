# Architecture

## 1. Purpose

This document defines the technical architecture for the Smart Application Monitoring & Failure Detection Platform.

The platform is designed as an open-source, zero-cost, AI-assisted reliability and observability system that can monitor applications, APIs, containers, Kubernetes clusters, Linux hosts, networks, security events, deployments, and infrastructure.

The core architectural principle is:

> **Collect → Normalize → Detect → Correlate → Investigate → Explain → Alert → Recommend**

The system should not merely display monitoring graphs. It should combine multiple signals to detect failures, correlate their causes, create incidents, investigate evidence, and provide human-readable root-cause explanations.

---

# 2. Architectural Vision

```text
                    ┌─────────────────────────────┐
                    │            USER             │
                    │     Developer / DevOps       │
                    │            / SRE             │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │       WEB DASHBOARD          │
                    │        Next.js / React       │
                    └──────────────┬──────────────┘
                                   │
                            REST / WebSocket
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         CONTROL PLANE                                │
│                                                                      │
│ API → Auth → Projects → Monitors → Incident Management              │
│                              │                                       │
│                     Detection / Correlation                          │
│                              │                                       │
│                         AI Analysis                                  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                         Event / Query Layer
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         DATA PLANE                                   │
│                                                                      │
│ Metrics      Logs       Traces       Profiles      Events            │
│   │           │           │             │           │               │
│ Prometheus   Loki       Tempo        Pyroscope    NATS              │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                       OpenTelemetry
                       / Exporters
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       COLLECTION LAYER                               │
│                                                                      │
│ OTel Collector │ kube-state-metrics │ node-exporter │ cAdvisor       │
│ Cilium/Hubble  │ Falco              │ Trivy        │ App SDKs        │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      MONITORED SYSTEMS                              │
│                                                                      │
│ Web Apps │ APIs │ Microservices │ Docker │ Kubernetes │ Linux │ DBs  │
└──────────────────────────────────────────────────────────────────────┘
```

---

# 3. Architectural Layers

The system is divided into seven major layers.

| Layer | Responsibility |
|---|---|
| Presentation | Dashboard, visualization, real-time status and incident views |
| Control Plane | Users, projects, monitors, integrations, incidents and configuration |
| Intelligence | Detection, anomaly analysis, correlation, RCA and AI investigation |
| Event Plane | Real-time telemetry/events and internal event distribution |
| Observability Plane | Metrics, logs, traces and profiles |
| Collection Plane | Agents, exporters, OpenTelemetry, eBPF and scanners |
| Target Plane | Applications, containers, Kubernetes, Linux hosts, databases and networks |

---

# 4. Core Architectural Principle

The internal platform should be built around a stable abstraction:

```text
Telemetry
    ↓
Event
    ↓
Evidence
    ↓
Incident
    ↓
Analysis
    ↓
Action
```

Open-source technologies such as Prometheus, Loki, Tempo, Kubernetes, Cilium, Falco, Trivy and K8sGPT should be treated as integrations/providers around this core rather than becoming the architecture itself.

This prevents the project from becoming a collection of unrelated tools.

---

# 5. Recommended Technology Stack

| Area | Technology | Purpose |
|---|---|---|
| Frontend | Next.js + React + TypeScript | Web application |
| UI | Tailwind CSS + shadcn/ui | Professional interface |
| Charts | Apache ECharts | Monitoring visualizations |
| Backend | Go | Infrastructure-oriented backend |
| API | REST + WebSocket/SSE | Application and real-time communication |
| Database | PostgreSQL | Platform metadata and state |
| Vector Search | pgvector | AI/RCA retrieval |
| Event Bus | NATS JetStream | Internal event streaming |
| Telemetry | OpenTelemetry | Vendor-neutral telemetry pipeline |
| Metrics | Prometheus | Time-series metrics |
| Logs | Grafana Loki | Log aggregation |
| Traces | Grafana Tempo | Distributed tracing |
| Profiles | Grafana Pyroscope | Continuous profiling |
| Kubernetes | Kubernetes | Container orchestration |
| Local Kubernetes | kind | Local development/demo cluster |
| Network Observability | Cilium + Hubble | eBPF networking and observability |
| Runtime Security | Falco | Runtime threat/event detection |
| Vulnerability Scanning | Trivy | Images, Kubernetes and configuration |
| Kubernetes Diagnosis | K8sGPT | Kubernetes troubleshooting assistance |
| IaC | OpenTofu | Infrastructure as Code |
| GitOps | Argo CD | Declarative Kubernetes deployment |
| AI Runtime | Ollama | Local LLM execution |
| Authentication | Keycloak or GitHub OIDC | Identity/authentication |
| Secrets | SOPS + age | Encrypted configuration/secrets |
| Containers | Docker or Podman | Container runtime |
| Reverse Proxy | Caddy | Local/prod reverse proxy |
| CI | GitHub Actions | Automated testing/building |

---

# 6. Zero-Cost Requirement

The project must not depend on paid cloud infrastructure or paid AI APIs.

The architecture should be local-first.

```text
                    YOUR COMPUTER
                         │
             ┌───────────┴───────────┐
             │                       │
        Kubernetes                Docker
             │                       │
             └───────────┬───────────┘
                         │
                  Monitoring Platform
                         │
             ┌───────────┴───────────┐
             │                       │
       Observability                AI
             │                       │
 Prometheus/Loki/Tempo           Ollama
             │                       │
             └───────────┬───────────┘
                         │
                     Dashboard
```

The real resource cost is therefore the user's own CPU, RAM, disk and optional GPU.

---

# 7. Target Systems

The platform should be designed to monitor several levels of infrastructure.

## 7.1 Website / API

Monitor:

- HTTP status
- Availability
- Response time
- Latency
- TLS certificate
- DNS
- Redirects
- Endpoint health

## 7.2 Application

Support applications such as:

- Node.js
- Python
- Java/Spring Boot
- Go
- .NET

Monitor:

- Requests/sec
- Error rate
- Latency
- CPU
- Memory
- Garbage collection
- Database calls
- External API calls
- Logs
- Distributed traces

## 7.3 Containers

Monitor:

- Container CPU
- Memory
- Network
- Filesystem
- Restart count
- Health status
- Container logs

Possible collection components:

- cAdvisor
- node-exporter
- OpenTelemetry
- Docker API

## 7.4 Kubernetes

Monitor:

```text
Cluster
 ├── Nodes
 │    ├── CPU
 │    ├── Memory
 │    ├── Disk
 │    └── Network
 │
 ├── Namespaces
 ├── Deployments
 ├── Pods
 │    ├── Restart count
 │    ├── OOMKilled
 │    ├── CrashLoopBackOff
 │    ├── Pending
 │    └── Image problems
 │
 ├── Services
 ├── Ingress
 ├── ConfigMaps
 ├── Secrets
 ├── PersistentVolumes
 └── Jobs
```

Collection sources:

- Kubernetes API
- kube-state-metrics
- node-exporter
- OpenTelemetry
- Prometheus

---

# 8. Observability Architecture

The three primary observability signals are:

```text
Metrics → WHAT is wrong?
Logs    → WHAT happened?
Traces  → WHERE did it happen?
```

Continuous profiling can extend this to:

```text
Profiles → WHY is this code/resource expensive?
```

The core observability pipeline is:

```text
Applications
     │
     ▼
OpenTelemetry SDK
     │
     ▼
OpenTelemetry Collector
     │
     ├─────────────► Prometheus
     │
     ├─────────────► Loki
     │
     └─────────────► Tempo
```

---

# 9. Metrics Architecture

```text
Application / Host / Kubernetes
            │
            ▼
       Exporter / OTel
            │
            ▼
        Prometheus
            │
       ┌────┴────┐
       │         │
 Recording     Alert
  Rules        Rules
       │         │
       └────┬────┘
            ▼
     Detection Engine
```

Examples:

```text
http_requests_total
http_request_duration_seconds
http_errors_total
container_cpu_usage
container_memory_usage
pod_restarts_total
node_cpu_usage
node_memory_available
```

Prometheus should remain the metrics backend. PostgreSQL should not be used for high-volume telemetry storage.

---

# 10. Logging Architecture

```text
Application
     │
     ▼
OTel Collector / Log Collector
     │
     ▼
Loki
     │
     ▼
LogQL
     │
     ▼
Incident Correlator
```

The platform should correlate logs with metrics, traces, Kubernetes events and deployment changes.

Example:

```text
ERROR database connection refused
ERROR payment service timeout
WARN retry attempt 3
```

These should become evidence associated with an incident rather than isolated log records.

---

# 11. Distributed Tracing

Use Grafana Tempo as the distributed tracing backend.

Example dependency:

```text
Frontend
    │
    ▼
API
    │
    ├──────► Auth Service
    │
    ├──────► Payment Service
    │
    └──────► Database
```

A trace can contain:

```text
Trace ID
   │
   ├── frontend span
   ├── API span
   ├── payment span
   └── database span
```

Tracing should support service dependency analysis and latency investigation.

---

# 12. Continuous Profiling

Use Pyroscope as an optional Phase 2/advanced capability.

Profiles can help identify:

- CPU hotspots
- Memory allocation
- Slow functions
- High-CPU services

It should not be required for the first working version.

---

# 13. Network Observability

Use Cilium + Hubble for advanced network visibility.

Example:

```text
User
 ↓
Frontend
 ↓
API
 ↓
Payment Service
 ↓
PostgreSQL
```

The system should be able to identify changes such as:

```text
API → Payment Service
        │
        └── latency increased

Payment Service → PostgreSQL
        │
        └── connection failures increased
```

This creates dependency-aware failure analysis.

---

# 14. eBPF and Runtime Security

The platform can use eBPF-based technologies for deeper infrastructure visibility.

```text
Linux Kernel
     │
    eBPF
     │
 ┌───┴─────────┐
 │             │
Cilium        Falco
 │             │
Network       Runtime
Observability Security
```

Potential runtime events:

- Unexpected process started
- Unexpected shell inside container
- Suspicious file access
- Unexpected network connection
- Privilege escalation indicators

These security events should feed into the same incident/evidence model.

---

# 15. Vulnerability and Configuration Scanning

Use Trivy as a security scanning integration.

```text
Trivy
 │
 ├── Container image scan
 ├── Kubernetes scan
 ├── Configuration scan
 ├── Dependency scan
 └── Secret exposure detection
```

Trivy should not become the monitoring engine.

Instead:

```text
Trivy
   ↓
Security Findings
   ↓
Your Platform
   ↓
Unified Incident Model
```

---

# 16. Kubernetes Diagnosis with K8sGPT

K8sGPT should be an optional intelligence provider rather than the foundation.

```text
Kubernetes
    │
    ├── Your Kubernetes Collector
    │
    └── K8sGPT
             │
             ▼
       Kubernetes diagnosis
             │
             ▼
       Incident Engine
```

The platform can combine:

```text
K8sGPT findings
+
Prometheus metrics
+
Loki logs
+
Tempo traces
+
Cilium network data
+
Deployment history
```

into one incident.

---

# 17. Event Architecture

Use NATS JetStream as the internal event bus.

Kafka should not be introduced initially because it adds operational complexity that is unnecessary for the project.

Suggested subjects:

```text
telemetry.metrics
telemetry.logs
telemetry.traces
kubernetes.events
security.events
deployment.events
incidents.detected
incidents.resolved
```

Architecture:

```text
              NATS
                │
 ┌──────────────┼────────────────┐
 │              │                │
Metrics       Logs            K8s Events
 │              │                │
 └──────────────┼────────────────┘
                │
          Correlation Engine
```

---

# 18. Control Plane

The control plane manages the platform itself.

Responsibilities:

- Authentication
- Users
- Projects
- Monitors
- Integrations
- Services
- Incident management
- Detection rules
- Notification configuration
- AI analysis records
- Audit logs

Suggested PostgreSQL entities:

```text
users
organizations
projects
monitors
integrations
services
incidents
incident_events
deployments
detection_rules
notification_channels
ai_analyses
audit_logs
```

---

# 19. PostgreSQL Usage

PostgreSQL is for application/platform state.

```text
PostgreSQL
│
├── users
├── organizations
├── projects
├── monitors
├── integrations
├── services
├── incidents
├── incident_events
├── deployments
├── detection_rules
├── notification_channels
├── AI analyses
└── audit logs
```

Do not store high-volume metrics, logs or traces in PostgreSQL.

Use:

```text
Prometheus → Metrics
Loki       → Logs
Tempo      → Traces
PostgreSQL → Platform metadata
pgvector   → AI/RCA retrieval
```

---

# 20. Backend Architecture

Use Go for the backend.

Start with a modular monolith instead of many microservices.

```text
backend/
│
├── api/
├── auth/
├── projects/
├── monitors/
├── incidents/
├── detection/
├── correlation/
├── integrations/
├── notifications/
├── kubernetes/
├── security/
├── ai/
├── telemetry/
└── database/
```

Initially deploy this as one backend application:

```text
monitoring-api
```

Heavy components can later be separated if necessary.

---

# 21. Backend Internal Flow

```text
HTTP / WebSocket
      │
      ▼
API Layer
      │
      ▼
Application Services
      │
 ┌────┼────────────┐
 ▼    ▼            ▼
Detection Incident Integration
 │      │            │
 └──────┼────────────┘
        ▼
    Repository
        │
        ▼
   PostgreSQL
```

Business logic should remain independent from HTTP so that it can be tested and reused.

---

# 22. Frontend Architecture

Use Next.js + React + TypeScript.

Suggested application structure:

```text
app/
│
├── landing/
├── dashboard/
├── projects/
├── monitors/
├── incidents/
├── services/
├── infrastructure/
├── kubernetes/
├── security/
├── traces/
├── logs/
├── metrics/
├── ai-insights/
└── settings/
```

For live updates:

```text
Telemetry
    ↓
Detection
    ↓
NATS
    ↓
WebSocket
    ↓
Dashboard
```

This allows the UI to show new incidents without requiring page refreshes.

---

# 23. Frontend Design Direction

The platform uses a professional enterprise light theme.

Primary palette:

| Purpose | Color | Hex |
|---|---|---|
| Primary / Brand | Deep Azure Blue | `#155EEF` |
| Primary Hover | Dark Blue | `#1047C7` |
| Primary Light | Pale Blue | `#E8F0FE` |
| Secondary | Teal | `#0F766E` |
| Page Background | Cool White | `#F8FAFC` |
| Cards / Surface | White | `#FFFFFF` |
| Border | Slate Gray | `#CBD5E1` |
| Primary Text | Navy Black | `#0F172A` |
| Secondary Text | Slate | `#475569` |
| Healthy / Success | Green | `#15803D` |
| Warning | Amber | `#B45309` |
| Critical / Failure | Red | `#B42318` |
| Information | Blue | `#0369A1` |
| AI / Insights | Violet | `#7C3AED` |

Design principles:

- Blue is the primary brand and interaction color.
- Green, amber and red are reserved for health/incident states.
- Violet is reserved for AI-powered insights.
- Neutral whites and slate tones form the main interface.
- Status should never be communicated by color alone.
- Accessibility and sufficient contrast must be maintained.

---

# 24. AI Architecture

AI should not replace deterministic monitoring.

Bad architecture:

```text
Everything → LLM → "Something is wrong"
```

Correct architecture:

```text
Telemetry
   ↓
Deterministic / Statistical Detection
   ↓
Evidence Collection
   ↓
AI Reasoning
   ↓
Human-readable Explanation
```

The AI layer is responsible for investigation, explanation, summarization and recommendations.

---

# 25. Local AI

Use Ollama for local LLM execution.

```text
Your Application
       │
       ▼
AI Service
       │
       ▼
Ollama
       │
 ┌─────┴─────┐
 │           │
Qwen       Gemma
```

The specific model can change based on hardware and model availability.

No paid inference API should be required.

---

# 26. AI Tool Architecture

The AI should have controlled tools instead of receiving an unstructured dump of all telemetry.

Example tools:

```text
query_metrics()
query_logs()
query_trace()
get_kubernetes_events()
get_pod_status()
get_deployment_history()
get_incident_history()
get_security_events()
get_vulnerability_report()
```

Investigation flow:

```text
AI Agent
   │
   ├── query_metrics()
   ├── query_logs()
   ├── query_trace()
   ├── get_kubernetes_events()
   ├── get_deployment_history()
   └── get_incident_history()
             │
             ▼
         Correlation
             │
             ▼
         Explanation
```

---

# 27. MCP Architecture

The platform can expose an MCP server to AI agents.

```text
                AI Agent
                   │
                  MCP
                   │
       ┌───────────┼───────────┐
       │           │           │
    Metrics      Logs       Kubernetes
       │           │           │
   Prometheus     Loki      K8s API
```

This allows AI systems to investigate the monitoring platform through structured tools rather than direct database access.

---

# 28. Incident Model

Create a unified internal incident model.

```text
Incident
│
├── ID
├── Project
├── Service
├── Severity
├── Status
├── Start time
├── End time
├── Detection source
│
├── Symptoms
│    ├── metric anomaly
│    ├── log anomaly
│    ├── trace anomaly
│    └── Kubernetes event
│
├── Related changes
│    ├── deployment
│    ├── Git commit
│    └── configuration change
│
├── Dependencies
│
├── Probable causes
│
├── Evidence
│
└── AI analysis
```

---

# 29. Detection Engine

Use a hybrid detection system.

## 29.1 Deterministic Rules

Examples:

```text
IF CPU > threshold
IF memory > threshold
IF error rate > threshold
IF latency > threshold
IF pod restarts > threshold
IF certificate < N days
```

## 29.2 Statistical Anomaly Detection

Start with explainable statistical methods:

- Moving average
- Standard deviation
- EWMA
- Percentile thresholds
- Historical baselines
- Seasonal baseline where appropriate

Avoid introducing complicated machine-learning pipelines until there is a clear need.

## 29.3 Event Correlation

Example:

```text
14:00 Deployment
14:01 CPU ↑
14:01 latency ↑
14:02 errors ↑
14:02 pods restart
14:03 database timeout
```

The engine should turn this into one incident rather than five unrelated alerts.

---

# 30. Correlation Engine

The correlation engine is the core differentiating component.

Instead of:

```text
CPU > 90%
→ Alert
```

the system should reason about:

```text
CPU increased
      +
latency increased
      +
error rate increased
      +
pod restarted
      +
deployment occurred
      +
database errors appeared
      ↓
   CORRELATION
      ↓
Possible deployment-related incident
```

---

# 31. Evidence Scoring

The initial correlation algorithm can use a transparent weighted evidence model.

Example:

| Evidence | Example Weight |
|---|---:|
| Deployment < 5 minutes before incident | +30 |
| Error-rate anomaly | +25 |
| Latency anomaly | +20 |
| Pod restart | +15 |
| Relevant log errors | +15 |
| Database errors | +20 |
| Network anomaly | +15 |
| CPU anomaly | +10 |
| Memory anomaly | +10 |

The score is:

```text
Candidate Cause Score = Σ Evidence Weights
```

The exact weights should be configurable and treated as an initial heuristic, not a universal truth.

AI can then interpret the evidence.

---

# 32. Example Incident

Example timeline:

```text
14:00 deployment
14:01 latency +180%
14:01 HTTP 500 +400%
14:02 pod restart
14:02 DB connection timeout
```

Evidence:

```text
Deployment           +30
Latency              +20
HTTP errors          +25
Pod restart          +15
DB errors             +20
                     ----
                     110
```

The platform can produce:

```text
Incident #1042

Potential deployment-related regression.

Evidence:
• Error rate increased significantly.
• P95 latency increased.
• Affected pods restarted.
• Database connection failures appeared.
• The changes began shortly after a deployment.
```

The AI explains collected evidence; it should not fabricate the underlying detection.

---

# 33. Git and Deployment Correlation

A major feature should connect source-code changes with runtime behaviour.

```text
Git Commit
    │
    ▼
Deployment
    │
    ▼
Application Change
    │
    ▼
Telemetry Change
    │
    ▼
Incident
```

Example:

```text
Commit #a71c9f
     ↓
Deployment 14:02
     ↓
HTTP 500 ↑ 340%
     ↓
Incident
```

The platform should be able to associate an incident with recent deployments and commits where evidence supports that relationship.

---

# 34. GitOps

Use Argo CD for Kubernetes GitOps where useful.

```text
Git Repository
      │
      ▼
   Argo CD
      │
      ▼
 Kubernetes
      │
      ▼
Monitoring Platform
```

The platform can correlate:

```text
Git change
+
Argo CD sync
+
Kubernetes rollout
+
Telemetry anomaly
=
Possible deployment incident
```

---

# 35. Infrastructure as Code

Use OpenTofu where infrastructure provisioning benefits from declarative configuration.

Suggested structure:

```text
infra/
│
├── kubernetes/
├── networking/
├── monitoring/
├── databases/
└── environments/
```

Do not force OpenTofu into every local-development task.

---

# 36. Local Kubernetes Environment

Use kind for the main local Kubernetes demonstration.

```text
kind
 │
 ├── monitoring-system
 │
 ├── demo-application
 │
 ├── database
 │
 └── failure-simulator
```

---

# 37. Failure Simulation Engine

Create a dedicated application for demonstrating detection capabilities.

```text
failure-simulator
│
├── CPU spike
├── Memory leak
├── HTTP 500
├── HTTP 503
├── Slow response
├── Database failure
├── Network latency
├── Network packet loss
├── Pod crash
├── CrashLoopBackOff
├── OOMKilled
├── Dependency failure
├── Certificate expiry
└── Deployment regression
```

Demonstration flow:

```text
Trigger Failure
       ↓
System Detects Failure
       ↓
Collects Evidence
       ↓
Correlates Signals
       ↓
Creates Incident
       ↓
AI Investigates
       ↓
Dashboard Explains Incident
```

---

# 38. Notification Architecture

Notifications should be abstracted behind a notification service.

```text
Incident
   │
   ▼
Notification Service
   │
   ├── In-app
   ├── Telegram
   ├── Webhook
   └── Email
```

Initial priority:

1. In-app notifications
2. Webhooks
3. Telegram

Email can remain optional.

---

# 39. Security Architecture

Monitoring components should use least privilege.

Example:

```text
monitoring-agent
       │
       ▼
Kubernetes ServiceAccount
       │
       ▼
RBAC
       │
       ├── get
       ├── list
       └── watch
```

Avoid using `cluster-admin` unless a specific component genuinely requires it.

---

# 40. AI Security Boundary

The initial AI implementation should be read-only.

```text
AI
 │
 ├── READ metrics
 ├── READ logs
 ├── READ traces
 ├── READ Kubernetes state
 └── READ deployments
```

The AI should not initially be able to:

```text
delete pod
restart cluster
modify deployment
change firewall
```

Future remediation can follow:

```text
Recommendation
      ↓
Human Approval
      ↓
Action
```

This provides a safer path toward automated remediation.

---

# 41. Optional OpenCost Integration

OpenCost can be added later to provide Kubernetes resource/cost visibility.

This could extend the platform from:

> Is my application healthy?

to:

> Is my application healthy, secure, performant and resource-efficient?

Potential service view:

```text
Service
│
├── Health
├── Performance
├── Security
└── Resource Cost
```

This is an advanced feature and not required for the core project.

---

# 42. Technologies Not Required Initially

Avoid adding technologies simply because they are popular.

Do not initially introduce:

```text
Kafka
RabbitMQ
Redis
Elasticsearch
MongoDB
Cassandra
Spark
Airflow
Istio
Multiple API gateways
Multiple databases
Complex ML pipelines
```

Every infrastructure component should have a clear architectural reason.

NATS is sufficient for the initial event-bus requirements.

---

# 43. Final Recommended Architecture

```text
                         ┌───────────────┐
                         │    Next.js    │
                         │   Dashboard   │
                         └───────┬───────┘
                                 │
                         REST / WebSocket
                                 │
                         ┌───────▼───────┐
                         │   Go Backend  │
                         │  Control API  │
                         └───────┬───────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
           PostgreSQL          NATS          AI Service
                │                │                │
                │                │              Ollama
                │                │
                │        ┌───────┴────────┐
                │        │                │
                │    Detection       Correlation
                │        │                │
                └────────┴───────┬────────┘
                                 │
                     ┌───────────▼───────────┐
                     │  Observability Layer │
                     └───────────┬───────────┘
                                 │
                ┌────────────────┼─────────────────┐
                │                │                 │
                ▼                ▼                 ▼
           Prometheus          Loki              Tempo
                │                │                 │
                └────────────────┼─────────────────┘
                                 │
                         OpenTelemetry
                           Collector
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
     Applications           Kubernetes             Linux Host
          │                      │                      │
          │              ┌───────┼───────┐              │
          │              │       │       │              │
          │             KSM    Cilium   Falco           │
          │                      │       │              │
          └──────────────────────┼───────┘              │
                                 │
                              Trivy
```

---

# 44. Implementation Phases

## Phase 1 — Foundation

Build:

```text
Next.js
Go
PostgreSQL
Docker
```

Implement:

- Authentication
- Projects
- Monitors
- Dashboard shell
- API
- Database

## Phase 2 — Basic Monitoring

Add:

```text
Prometheus
node-exporter
cAdvisor
```

Implement:

- CPU
- RAM
- Disk
- Network
- Availability
- Latency

## Phase 3 — Logs

Add:

```text
Loki
OpenTelemetry Collector
```

Implement:

- Log ingestion
- Log search
- Log correlation

## Phase 4 — Tracing

Add:

```text
Tempo
OpenTelemetry
```

Implement:

- Trace viewer
- Service dependency graph
- Latency investigation

## Phase 5 — Kubernetes

Add:

```text
kind
kube-state-metrics
Kubernetes API
```

Implement:

- Nodes
- Pods
- Deployments
- Services
- Namespaces
- Kubernetes failure states

## Phase 6 — Detection Engine

Implement:

```text
Rules
+
Anomaly Detection
+
Correlation
```

This is a core project milestone.

## Phase 7 — Incident Management

Build:

```text
Incident
   ↓
Evidence
   ↓
Timeline
   ↓
Root-cause candidates
   ↓
Resolution
```

## Phase 8 — AI

Add:

```text
Ollama
K8sGPT
AI tools
MCP
```

Implement:

```text
Incident
   ↓
Evidence
   ↓
AI Investigation
   ↓
Explanation
```

## Phase 9 — Security

Add:

```text
Trivy
Falco
Cilium/Hubble
```

## Phase 10 — Advanced Capabilities

Optional:

```text
Pyroscope
OpenCost
Argo CD
OpenTofu
Git correlation
Human-approved remediation
```

---

# 45. Development Strategy

The platform should be implemented incrementally.

Do not ask the coding agent to build the entire architecture at once.

The OpenCode + Muse Spark workflow should follow bounded modules:

```text
Architecture
     ↓
Contracts / Interfaces
     ↓
Module
     ↓
Tests
     ↓
Integration
     ↓
Next Module
```

Keep architecture documentation and API/data contracts available to the coding agent so it can understand how each module fits into the whole system.

---

# 46. Development Resource Profiles

The complete stack can be heavy, so development should use progressive profiles.

## Minimal

```text
Next.js
Go backend
PostgreSQL
Prometheus
Grafana
kind
```

## Medium

Add:

```text
Loki
Tempo
OpenTelemetry
NATS
```

## Advanced Demo

Add:

```text
Cilium
Hubble
Falco
Trivy
Ollama
K8sGPT
Pyroscope
```

Do not run every component simultaneously unless the development machine can support it.

---

# 47. Core Differentiation

The individual technologies are not the primary innovation.

Prometheus is not the innovation.

Grafana/Loki/Tempo are not the innovation.

K8sGPT is not the innovation.

Trivy is not the innovation.

The differentiation is the integration and reasoning layer.

Traditional monitoring:

```text
Metric
 ↓
Alert
```

This platform:

```text
Metric
  +
Log
  +
Trace
  +
Kubernetes event
  +
Network event
  +
Security event
  +
Deployment change
  +
Historical behaviour
       ↓
Correlation
       ↓
Incident
       ↓
AI investigation
       ↓
Root-cause explanation
```

The intended product capability is:

> **An open-source reliability platform that combines heterogeneous observability, infrastructure, security, deployment and AI signals to detect, correlate and explain application failures.**

---

# 48. Architectural Summary

The final system should follow these principles:

1. **Local-first and zero-cost**
2. **Open-source technologies wherever practical**
3. **OpenTelemetry as the telemetry normalization layer**
4. **Prometheus for metrics**
5. **Loki for logs**
6. **Tempo for traces**
7. **PostgreSQL for platform state**
8. **NATS for internal event streaming**
9. **Go for the backend**
10. **Next.js/React/TypeScript for the frontend**
11. **Kubernetes/kind for container-orchestration monitoring**
12. **Cilium/Hubble for network observability**
13. **Falco for runtime security events**
14. **Trivy for security/configuration scanning**
15. **K8sGPT as an optional Kubernetes diagnostic provider**
16. **Ollama for local AI**
17. **AI as an investigation/explanation layer, not the detection foundation**
18. **Hybrid deterministic + statistical + correlation-based detection**
19. **Unified incident/evidence model**
20. **Git/deployment correlation**
21. **Least-privilege security**
22. **Read-only AI initially**
23. **Human approval before future remediation**
24. **Modular monolith before microservices**
25. **Progressive implementation rather than building the entire stack at once**

The central architecture is:

```text
COLLECT
   ↓
NORMALIZE
   ↓
DETECT
   ↓
CORRELATE
   ↓
CREATE INCIDENT
   ↓
INVESTIGATE
   ↓
EXPLAIN
   ↓
ALERT
   ↓
RECOMMEND
   ↓
[Future: Human-approved Remediation]
```

This architecture should be treated as the project's technical baseline. Individual technologies may be upgraded or replaced later as long as they preserve the core interfaces and architectural responsibilities.

---

# Appendix A — Phase 2 implementation status (2026-09-30)

This appendix records what of the vision above is **actually implemented** today,
so the baseline is not mistaken for shipped capability. It is verified locally
(unit tests + an RLS harness against a throwaway Postgres); it has not yet run
against the remote database.

The implemented slice realizes **DETECT → CREATE INCIDENT → INVESTIGATE →
EXPLAIN → RECOMMEND → [Human-approved Remediation]** for a project's demo
services, using Postgres (via Supabase) as the system of record. High-volume
COLLECT/NORMALIZE (Prometheus/Loki/Tempo/OTel) remains future — the only signal
source today is `service_health_checks`, written by a controlled simulation and
by an internal monitor, never by a real agent.

**Data model (RLS-scoped, project/incident membership enforced in the DB):**
`services`, `incidents`, `incident_events`, `incident_evidence`, `ai_analyses`,
`remediation_actions`, `service_health_checks`, `verification_runs`. Access is
gated by the `can_access_project` / `can_access_incident` SECURITY DEFINER
helpers, and the remediation `action_type` allowlist is a database CHECK — there
is deliberately no arbitrary-command action type.

**Control flow (in `lib/`):**

- **DETECT** — `detection/monitor.ts` records observed health checks (incl. the
  labelled simulation); `detection/reconcile.ts` opens/deduplicates incidents and
  detects recovery from N consecutive healthy checks. Observe → detect; a button
  never creates an incident directly.
- **EXPLAIN** — `ai/*` provides a provider abstraction with a deterministic test
  provider, validated structured output (Observation → Evidence → Interpretation
  → Confidence → Suggested action), read-only and disclaimed. It reasons only
  over supplied evidence and cannot mutate state.
- **RECOMMEND + REMEDIATE** — `remediation/actions.ts` (typed allowlist, fails
  closed) and `remediation/engine.ts` (human-approved, demo services only).
  `verification_runs` confirm recovery before an incident is resolved.

**Presentation:** `/projects/[id]` (dashboard), `/projects/[id]/incidents/[id]`
(detail), and `/projects/[id]/incidents/[id]/report` (+ JSON export route). AI is
always visually distinct (violet) and status is never conveyed by colour alone.

**Not yet implemented from the vision:** the real collectors/normalizers, NATS,
correlation beyond time-proximity "related changes", alerting/notification
transports, Kubernetes/K8sGPT, security scanning, GitOps/IaC, cost, and the Go
control plane. See `PROJECT_CURRENT_STATE.md` for the live checkpoint and the
remaining `supabase db push` blocker.
