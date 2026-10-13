# TrafficPulse Architecture

TrafficPulse is designed as an evidence-based, privacy-first web traffic intelligence and bot governance platform for the agentic web.

## High-Level System Architecture

```
[ Clients & AI Agents ]
          |
          v
   +--------------+
   | Host Website | (Next.js / Express / Cloudflare Workers)
   +--------------+
          |
          |  (1) Local Classification (0 latency)
          |  (2) Fail-open Async Telemetry Dispatch
          v
+--------------------------------------------------------+
| TrafficPulse Dashboard & Ingestion Service             |
|                                                        |
|  +--------------------+      +----------------------+  |
|  | Schema Validation  | ---> | Rate Limiter         |  |
|  | & Sanitization     |      | (Memory or Redis)    |  |
|  +--------------------+      +----------------------+  |
|            |                                           |
|            v                                           |
|  +--------------------+      +----------------------+  |
|  | Epistemic          |      | Privacy Layer        |  |
|  | Classifier         | ---> | IP Masking (/24, /64)|  |
|  +--------------------+      +----------------------+  |
|            |                                           |
|            v                                           |
|  +--------------------------------------------------+  |
|  | Persistent Storage (Prisma: PostgreSQL / SQLite)  |  |
|  +--------------------------------------------------+  |
+--------------------------------------------------------+
          |
          +---> Prometheus Exporter (/api/metrics)
          +---> Admin Analytics API & UI (/api/v1/analytics)
```

## Core Subsystems

### 1. Epistemic Traffic Classifier (`@trafficpulse/classifier`)
Evaluates traffic evidence hierarchically:
- **Verified Networks**: Matches IP against official vendor CIDR blocks (OpenAI, Anthropic, Google, Microsoft, Perplexity).
- **Declared Signatures**: Inspects User-Agent tokens against known AI crawler patterns.
- **Client Entropy Signals**: Evaluates interaction entropy and WebGL device hints.
- **Precedence & Heuristics**: Enforces strict confidence ceilings. If client biometrics conflict with declared bot signatures, falls back to `unknown`.

### 2. Edge Middleware (`@trafficpulse/middleware`)
Provides drop-in integration for Next.js, Express, and Cloudflare Workers:
- Runs classifier locally at the edge with zero round-trip overhead.
- Dispatches telemetry asynchronously via fire-and-forget requests.
- Implements bounded retries (max 2) and exponential backoff.
- Strictly fail-open: backend failure never impacts the host application.

### 3. Client Sensor (`@trafficpulse/tracker`)
Zero-dependency (<3KB) telemetry collector:
- Collects screen dimensions, webdriver presence, and interaction counters.
- Behavioral signals (mouse entropy, scroll entropy, WebGL renderer) are opt-in by default.
- Honors browser privacy signals (Do Not Track, Global Privacy Control).

### 4. Ingestion & Storage Pipeline (`apps/dashboard`)
Production ingestion API (`POST /api/v1/events`):
- Enforces 64KB maximum payload bounds and strict schema validation.
- Sanitizes and strips untrusted client-supplied classification claims.
- Hashed API key authentication with SHA-256.
- Idempotency deduplication preventing replayed telemetry from inflating statistics.
- Automated data retention pruning (default 90 days).

