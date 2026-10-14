# TrafficPulse Production Readiness Audit

**Date:** 2026-10-14  
**Auditor:** Senior Staff Hardening Engineer  
**Branch:** `main`  
**Target Repo:** `https://github.com/amalrn98/TrafficPulse`  

This document records the complete baseline audit, finding statuses, verification commands, and remediation details for TrafficPulse across all phases (Phase 0 through Phase 10).

## 1. Baseline Commands and Exact Results

### 1.1 Repository State
Command: `git remote -v; git log --oneline -5; git status`
Result: Clean working tree on branch `main`.
Exit: `0`

### 1.2 Monorepo Build and Test Verification
Command: `npm run build; npm test`
Result: All workspaces build and all 47 tests pass cleanly:
- `@trafficpulse/classifier`: 14 tests pass (13 unit + regression suite)
- `@trafficpulse/middleware`: 7 tests pass (unit + `event.waitUntil` + fail-open resilience)
- `@trafficpulse/tracker`: 6 tests pass (SSR, telemetry, opt-in behavior, GPC)
- `@trafficpulse/dashboard`: 20 tests pass (DB, Redis RESP rate-limit, validation, metrics, auth)
Exit: `0`

## 2. Ranked Findings and Resolution Status

### P0 - Production Blockers (All Resolved)

| ID | Component | Finding | Status | Resolution & Evidence |
|---|---|---|---|---|
| **SEC-01** | `analytics/route.ts`, `auth.ts`, `page.tsx` | Missing authentication on analytics API; production UI needed admin login flow. | **Fixed** | Added constant-time `verifyAdminAuth` guard (`crypto.timingSafeEqual`) on GET, POST, and DELETE in `apps/dashboard/src/app/api/v1/analytics/route.ts` and added an Admin Key login modal in `apps/dashboard/src/app/page.tsx`. |
| **SEC-02** | `db.ts`, `schema.prisma` | Raw API keys stored in plaintext or hashed with fast digest (CodeQL #110). | **Fixed** | Derived `keyHash` via `crypto.scryptSync` KDF with bounded memoization (resolving CodeQL CWE-916 alert #110) and enforced `apiKey: null` in DB creation so raw keys are returned once and never persisted on disk. |
| **SEC-03** | `ip-utils.ts` | Proxy header trust unconditionally enabled in production. | **Fixed** | Restricted `extractClientIp` in `src/lib/ip-utils.ts` to require explicit `TRUST_PROXY=true`. |
| **SEC-04** | `apps/dashboard/package.json` | Next.js and PostCSS security advisories. | **Fixed** | Upgraded `next` to `^14.2.25` (patched 14.x LTS), `eslint-config-next` to `^14.2.25`, and `postcss` to `^8.5.3`. Verified full build and test pass. |
| **SEC-05** | `events/route.ts` | Wildcard CORS reflection on ingestion endpoint. | **Fixed** | Recomputed domain-scoped CORS headers in `buildCorsHeaders(origin, site.domain)` after resolving the target site and enforced `403 ORIGIN_MISMATCH` on unauthorized cross-origin browser beacons. |
| **DAT-01** | `schema.prisma`, `schema.postgres.prisma`, `ci.yml` | Hardcoded SQLite provider in production Docker and CI builds. | **Fixed** | Added `apps/dashboard/prisma/schema.postgres.prisma` for production Docker builds, retained SQLite for zero-config local dev, and added PostgreSQL 16 integration test execution in `.github/workflows/ci.yml`. |
| **DAT-02** | `schema.prisma`, `db.ts` | Unbounded full-table scans on analytics polling. | **Fixed** | Added compound indexes `@@index([siteId, isDemo, timestamp])` and `@@index([siteId, actorType])`, 60-second TTL site caching, and 24-hour time-windowed, DB-bounded aggregation queries in `db.ts`. |
| **OPS-01** | `Dockerfile` | Bloated image running as root with dev dependencies. | **Fixed** | Rewrote Dockerfile: pinned `node:22.14-alpine`, `npm ci`, PostgreSQL Prisma client generation, Next.js standalone output, non-root user `nextjs` (UID 1001), and `HEALTHCHECK`. |

### P1 - Correctness, Privacy, and Resilience (All Resolved)

| ID | Component | Finding | Status | Resolution & Evidence |
|---|---|---|---|---|
| **DOC-01** | `README.md`, `page.tsx` | Badges and footer links pointed to obsolete remote. | **Fixed** | Updated links in `README.md` and `apps/dashboard/src/app/page.tsx` to `amalrn98/TrafficPulse` and replaced static SVG with live GitHub Actions badge. |
| **DOC-02** | `README.md` L111 | `onClassified` example used legacy `category: generic_bot`. | **Fixed** | Replaced with documented taxonomy (`actorType: 'automation_tool'`). |
| **DOC-03** | `README.md`, `evaluation.test.ts` | 19-fixture test framed as "100% accuracy benchmark". | **Fixed** | Reframed as regression test suite; added `docs/EVALUATION.md` documenting methodology and heuristic score limitations. |
| **PKG-01** | `middleware/package.json` | No exports map or types field. | **Fixed** | Added `exports` map (`.`, `./nextjs`, `./express`, `./cloudflare`), `types`, and `engines` (`>=20.0.0`). |
| **CLS-01** | `ip-ranges.ts` | Hardcoded CIDR lists with static placeholder dates. | **Fixed** | Extracted vendor ranges to versioned data file `packages/classifier/data/ip-ranges.json`. Added refresh script and scheduled workflow. |
| **CLS-02** | `classifier.ts` | Conflicting signals returned bot classification instead of `unknown`. | **Fixed** | Updated classifier to return `actorType: 'unknown'`, `verificationStatus: 'unknown'`, and confidence `0.40` when bot signature conflicts with human interaction entropy. |
| **CLS-03** | `classifier.ts` | No formal confidence cap by evidence tier. | **Fixed** | Added confidence caps (0.95 for CIDR verified, 0.75 for declared, 0.40 for conflicting) and regression assertions. |
| **PRV-01** | `tracker/src/index.ts` | Behavioral signals and WebGL collected by default. | **Fixed** | Made behavioral signals (mouse/scroll entropy, WebGL) opt-in by default via `enableBehavior: true` with backward-compatible `disableBiometrics` alias. |
| **PRV-02** | `tracker/src/index.ts` | Global Privacy Control (GPC) ignored. | **Fixed** | Added `navigator.globalPrivacyControl` check to `isOptedOut()`. |
| **PRV-03** | `docs/` | Missing privacy documentation. | **Fixed** | Created comprehensive `docs/PRIVACY.md` detailing data inventory, IP masking, retention, and legal considerations. |
| **DAT-03** | `db.ts`, `admin/retention/prune/route.ts` | Unbounded event growth; missing retention prune API endpoint. | **Fixed** | Added `pruneRetentionEvents(retentionDays)` and `deleteSiteEvents(siteId)` to `dbStore` and created `POST /api/v1/admin/retention/prune` protected by `verifyAdminAuth`. |
| **SEC-06** | `rate-limit.ts` | In-memory only rate limiter stub. | **Fixed** | Implemented zero-dependency Node `net`/`tls` Redis RESP Lua token-bucket client in `RedisRateLimiter` with 150 ms timeout and automatic fallback to `MemoryRateLimiter`. |
| **SEC-07** | `next.config.mjs` | Missing security headers and strict CSP. | **Fixed** | Configured CSP, HSTS, X-Content-Type-Options, X-Frame-Options, and Referrer-Policy in `next.config.mjs`. |
| **NET-01** | `middleware/src/*.ts` | Middleware dispatch lacked timeouts, retry resilience, and Edge `waitUntil`. | **Fixed** | Created `dispatchEventWithRetry` with 3,000 ms timeout, bounded retries (max 2), `event.waitUntil` registration in Next.js Edge middleware, and strict fail-open execution. |
| **OPS-02** | `docker-compose.yml` | Obsolete version key; missing Postgres and Redis services. | **Fixed** | Rewrote `docker-compose.yml` with Postgres 16, Redis 7, volumes, resource limits, and healthchecks. Created `docker-compose.dev.yml`. |
| **OPS-03** | `health/route.ts`, `trafficpulse.yaml` | Health check coupled to DB; missing K8s scaling and security primitives. | **Fixed** | Created DB-independent liveness probe at `/api/health/liveness`, kept DB readiness check at `/api/health`, and hardened `deploy/kubernetes/trafficpulse.yaml` with HPA, PDB, NetworkPolicy, `securityContext` (`readOnlyRootFilesystem: true`, UID 1001), `/tmp` `emptyDir`, and Prometheus scrape annotations. |
| **OBS-01** | `apps/dashboard/src/app/api/` | Missing structured logging and metrics export. | **Fixed** | Implemented structured JSON logger with request IDs and zero PII. Added protected Prometheus exposition endpoint at `/api/metrics`. |
| **TST-01** | `.github/workflows/` | Incomplete CI workflows and missing security scans. | **Fixed** | Updated `ci.yml` with Node 20/22 matrix, SQLite + PostgreSQL 16 test execution, `npm ci`, and lint. Added `security.yml` (CodeQL, Trivy) and `release.yml`. |

### P2 - Hygiene and Maintenance (All Resolved)

| ID | Component | Finding | Status | Resolution |
|---|---|---|---|---|
| **HYG-01** | `ci.yml` | Redundant build step. | **Fixed** | Consolidated to single build step in `.github/workflows/ci.yml`. |
| **HYG-02** | Root | Missing `.dockerignore`. | **Fixed** | Created `.dockerignore` excluding `node_modules`, `.git`, `.next`, and logs. |
| **HYG-03** | `SECURITY.md` | Incomplete disclosure process and noreply email. | **Fixed** | Updated `SECURITY.md` with security contact email, response SLAs, and coordinated disclosure process. |
| **HYG-04** | Root / `docs/` | Missing governance and technical documentation. | **Fixed** | Added `CODE_OF_CONDUCT.md`, `CODEOWNERS`, `ROADMAP.md`, PR template, `SELF_HOSTING.md`, `CONFIGURATION.md`, `ARCHITECTURE.md`, `THREAT_MODEL.md`, and OpenAPI 3.0 spec. |
| **HYG-05** | Root | Missing release versioning workflow. | **Fixed** | Configured Changesets (`.changeset/config.json`), added initial changeset, and generated root `CHANGELOG.md` for v0.1.0. |
| **HYG-06** | CI | Unpinned Node version and non-reproducible install. | **Fixed** | Pinned Node 22 LTS in Dockerfile and CI; enforced `npm ci`. |
| **HYG-07** | `db.ts` | Weak typing on `clientHints`. | **Fixed** | Replaced `any` with structured typing in `src/lib/db.ts`. |
| **HYG-08** | `scripts/seed-demo.mjs` | Seed script executable in production. | **Fixed** | Added strict production guard preventing accidental execution when `NODE_ENV === 'production'`. |
| **HYG-09** | Packages | Missing `engines` field in package.json files. | **Fixed** | Added `"engines": { "node": ">=20.0.0" }` across classifier, tracker, and middleware packages. |
| **HYG-10** | `classifier/package.json` | Missing `types` field. | **Fixed** | Added `"types": "./dist/src/index.d.ts"` and `"files": ["dist/src", "data"]`. |

## 3. Items Requiring Human Decision

The following items are outside automated code scope and require human maintainer input:
1. **Legal Review of Privacy**: Counsel should review `docs/PRIVACY.md` to confirm legitimate interest bases for IP masking under specific European DPA guidelines.
2. **Upstream Ownership Confirmation**: Verify whether `amalrn98/TrafficPulse` or another organization is the definitive production deployment target.
3. **Perplexity CIDR Endpoint Verification**: Perplexity AI has not yet published an official automated JSON endpoint; CIDR ranges are sourced from observed ASN records and require periodic manual confirmation (see `docs/DECISIONS.md` DEC-007).
