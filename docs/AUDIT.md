# TrafficPulse Production Readiness Audit

Date: 2026-10-13  
Auditor: Senior Staff Hardening Engineer  
Branch: `hardening/production-readiness`  

This audit records the baseline state of the TrafficPulse codebase before Phase 1 through Phase 9 hardening interventions. Every finding is backed by static source analysis or command execution output.

---

## 1. Baseline Verification Commands & Results

### 1.1 Package Installation & Lockfile
- Command: `npm install`
- Result: Exit Code 0 (clean dependency resolution with workspace linking).

### 1.2 Monorepo Build
- Command: `npm run build`
- Result: Exit Code 0.
  - `@trafficpulse/classifier`: `tsc` compiled successfully to `dist/`.
  - `@trafficpulse/tracker`: `tsc` compiled successfully to `dist/`.
  - `@trafficpulse/middleware`: `tsc` compiled successfully to `dist/`.
  - `@trafficpulse/dashboard`: `next build` compiled successfully (Next.js 14.2.35).
  - Routes generated: `/` (8.83 kB), `/_not-found` (873 B), `/api/health` (0 B), `/api/v1/analytics` (0 B), `/api/v1/events` (0 B).

### 1.3 Static Analysis & Linting
- Command: `npm run lint`
- Result: Exit Code 0 (0 ESLint errors, 0 warnings across dashboard source files).

### 1.4 TypeScript Typechecking
- Command: `npx tsc --noEmit --project packages/classifier/tsconfig.json; npx tsc --noEmit --project packages/tracker/tsconfig.json; npx tsc --noEmit --project packages/middleware/tsconfig.json; npx tsc --noEmit --project apps/dashboard/tsconfig.json`
- Result: Exit Code 0 across all packages and dashboard.

### 1.5 Test Suite Execution
- Command: `npm test`
- Result: Exit Code 0. 33 tests passed, 0 failed.
  - `@trafficpulse/classifier`: 12 tests passed (including evaluation benchmark).
  - `@trafficpulse/middleware`: 3 tests passed.
  - `@trafficpulse/tracker`: 3 tests passed.
  - `@trafficpulse/dashboard`: 15 tests passed.

### 1.6 Security Vulnerability Audit
- Command: `npm audit --json`
- Result: Exit Code 1. Found 12 vulnerabilities (1 critical, 9 high, 2 moderate).
  - Critical: GHSA-p293-qw3h-jr36 (Next.js: Unauthenticated Remote Code Execution on windows-hosted servers).
  - Critical: GHSA-2xp9-vwfh-vxw4 (Next.js: Unauthenticated Remote Code Execution in Image Optimization API with AVIF).
  - High: GHSA-p9j2-gv94-2wf4 (Next.js: Server-Side Request Forgery in rewrites).
  - High: GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 (PostCSS: Path traversal and arbitrary file read via sourceMappingURL).
  - Moderate: GHSA-4633-3j49-mh5q, GHSA-4c39-4ccg-62r3, GHSA-955p-x3mx-jcvp (Next.js: Cache confusion, edge payload bounds, endpoint disclosure).

### 1.7 Outdated Dependencies
- Command: `npm outdated --json`
- Key outdated packages:
  - `next`: Installed 14.2.35, Latest 16.4.0 (Upgrade path recommended to 14.2.24+ security patch or stable 15/16).
  - `@prisma/client` & `prisma`: Installed 5.22.0, Latest 6.19.3.
  - `typescript`: Installed 5.4.5 / 5.9.3, Latest 7.0.2.
  - `tailwindcss`: Installed 3.4.19, Latest 4.3.3.
  - `eslint`: Installed 8.57.0, Latest 9.39.5.
  - Node target: Local runtime is Node v20.18.0; container target needs pinning to Node 22 LTS.

---

## 2. Ranked Findings

Findings are categorized by severity:
- **P0**: Blocks production deployment, critical security vulnerability, data loss risk, or missing core architectural foundation.
- **P1**: Defect in correctness, privacy compliance gap, missing resilience/observability feature, or deceptive documentation.
- **P2**: Code hygiene issue, minor cleanup, or maintenance enhancement.

### Priority P0: Blocks Production

| ID | Category | Component | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Security | `apps/dashboard/src/app/api/v1/analytics/route.ts` | Missing authentication and authorization on dashboard API. Any unauthenticated caller can list all registered sites, view cross-tenant analytics data, or create new sites. | Open (Scheduled Phase 3) |
| **SEC-02** | Security | `apps/dashboard/src/lib/db.ts`, `schema.prisma` | Plaintext API key storage in database. Site API keys are stored in plaintext and returned via public API responses. Keys must be hashed with SHA-256 and never revealed after creation. | Open (Scheduled Phase 3) |
| **SEC-03** | Security | `apps/dashboard/src/lib/ip-utils.ts` | Insecure proxy header trust. `extractClientIp` trusts `X-Forwarded-For` and `X-Real-IP` by default whenever `NODE_ENV === 'production'`, allowing attackers to forge IP headers and spoof verified crawler IP checks. | Open (Scheduled Phase 3) |
| **SEC-04** | Security | `package-lock.json`, Next.js 14.2.35 | Critical CVEs in Next.js (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4) allowing unauthenticated remote code execution. | Open (Scheduled Phase 9) |
| **SEC-05** | Security | `apps/dashboard/src/app/api/v1/events/route.ts` | Wildcard CORS configuration. Ingestion endpoint sets `Access-Control-Allow-Origin: *` or reflects arbitrary caller origins rather than checking against registered site domains. | Open (Scheduled Phase 3) |
| **DAT-01** | Database | `apps/dashboard/prisma/schema.prisma` | Hardcoded SQLite provider. Production requires PostgreSQL for concurrent writes and transaction isolation, retaining SQLite for local dev only. Committed migrations are missing. | Open (Scheduled Phase 2) |
| **DAT-02** | Database | `apps/dashboard/package.json` | Missing committed Prisma migrations. Production currently uses `prisma db push`, which can cause data loss and lacks version control. | Open (Scheduled Phase 2) |
| **OPS-01** | Deployment | `Dockerfile` | Insecure container configuration. Container runs as root, lacks non-root user, lacks Next.js standalone output pruning, and does not execute startup database migrations. | Open (Scheduled Phase 6) |

---

### Priority P1: Correctness, Privacy, & Resilience Deficiencies

| ID | Category | Component | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **DOC-01** | Documentation | `README.md` | Static build badge and repository mismatch. Build badge is a hardcoded SVG rather than a live GitHub Actions status badge. | Open (Scheduled Phase 1) |
| **DOC-02** | Documentation | `README.md` | Non-compiling and mismatched examples. Middleware example in README checks `classification.category === 'generic_bot'`, which conflicts with the documented taxonomy (`actorType: 'automation_tool'`). Missing `examples/` directory. | Open (Scheduled Phase 1) |
| **DOC-03** | Documentation | `README.md`, `packages/classifier` | Misleading benchmark framing. Presenting 19 test fixtures as "100.0% accuracy" is unscientific. Must be reframed as regression tests, with a documented evaluation methodology and an expanded fixture split. | Open (Scheduled Phase 1) |
| **PKG-01** | Packaging | `packages/middleware/package.json` | Missing dual CJS and ESM build. Express example requires CommonJS `require`, but middleware package lacks proper `exports` map and module resolution for dual consumers. | Open (Scheduled Phase 1) |
| **DAT-03** | Lifecycle | `apps/dashboard/src/lib/db.ts` | Missing automated data retention job. Event tables grow unbounded with no scheduled pruning (default 90 days) and no per-site deletion mechanism. | Open (Scheduled Phase 2) |
| **SEC-06** | Security | `apps/dashboard/src/lib/rate-limit.ts` | In-memory rate limiter lacks distributed Redis adapter for horizontal scaling. | Open (Scheduled Phase 3) |
| **SEC-07** | Security | `apps/dashboard/next.config.mjs` | Missing Content Security Policy (CSP) and HTTP security headers (HSTS, X-Content-Type-Options, Frame-Options). | Open (Scheduled Phase 3) |
| **CLS-01** | Classifier | `packages/classifier/src/ip-ranges.ts` | Hardcoded CIDR lists. Published bot IP blocks are embedded in source code rather than versioned, validated data files with source URLs and refresh automation. | Open (Scheduled Phase 4) |
| **CLS-02** | Classifier | `packages/classifier/src/classifier.ts` | Conflicting signals resolution. When bot signatures conflict with client biometrics, the engine flags the conflict but still outputs the bot classification instead of falling back to `unknown`. | Open (Scheduled Phase 4) |
| **CLS-03** | Classifier | `packages/classifier/src/classifier.ts` | Uncalibrated heuristic confidence caps. Confidence scores can reach 0.75 without network corroboration; caps must be enforced by evidence tier. | Open (Scheduled Phase 4) |
| **PRV-01** | Privacy | `packages/tracker/src/index.ts` | Behavioral biometrics and WebGL hints are active by default rather than opt-in, risking ePrivacy/GDPR non-compliance. Config key is named `disableBiometrics` rather than opt-in behavior. | Open (Scheduled Phase 5) |
| **PRV-02** | Privacy | `packages/tracker/src/index.ts` | Tracker ignores Global Privacy Control (`navigator.globalPrivacyControl`), only checking legacy DNT. | Open (Scheduled Phase 5) |
| **PRV-03** | Privacy | `docs/` | Missing `docs/PRIVACY.md` detailing exact data collection fields, Shannon entropy formulas, IP masking, and retention. | Open (Scheduled Phase 5) |
| **NET-01** | Resilience | `packages/middleware/src/*.ts` | Middleware adapters do not implement timeouts or fail-open safety. A network hang or ingestion outage could block host request lifecycles. | Open (Scheduled Phase 7) |
| **OPS-02** | Deployment | `docker-compose.yml` | Obsolete `version: '3.8'` tag, missing PostgreSQL service, missing Redis service, missing healthcheck dependencies, and no separate development compose file. | Open (Scheduled Phase 6) |
| **OPS-03** | Observability | `apps/dashboard/src/app/api/health/route.ts` | Lack of separated liveness vs readiness probes. Current `/api/health` queries the database on every call, risking container restart loops if DB is transiently slow. | Open (Scheduled Phase 6) |
| **OBS-01** | Observability | `apps/dashboard/src/app/api/` | Missing structured JSON logging with request IDs and missing Prometheus `/metrics` endpoint. | Open (Scheduled Phase 7) |
| **TST-01** | Testing | `.github/workflows/ci.yml` | CI does not test against real PostgreSQL in container services, does not run Playwright end-to-end tests, and lacks CodeQL/Dependabot scanning. | Open (Scheduled Phase 8) |

---

### Priority P2: Hygiene & Maintenance Improvements

| ID | Category | Component | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **HYG-01** | Hygiene | `.github/workflows/ci.yml` | Redundant build step (`npm run build` followed by explicit `npm run build --workspace=@trafficpulse/dashboard`). | Open (Scheduled Phase 8) |
| **HYG-02** | Hygiene | `.dockerignore` | Missing `.dockerignore` file causing unnecessary context transfer during image builds. | Open (Scheduled Phase 6) |
| **HYG-03** | Hygiene | `SECURITY.md` | Generic user email listed instead of formal coordinated disclosure process. | Open (Scheduled Phase 3) |
| **HYG-04** | Hygiene | Root directory | Missing `CODE_OF_CONDUCT.md`, `CODEOWNERS`, `ROADMAP.md`, and comprehensive documentation directory. | Open (Scheduled Phase 9) |
| **HYG-05** | Hygiene | Versioning | Missing Changesets setup for monorepo version management and changelog generation. | Open (Scheduled Phase 8) |

---

## 3. Summary and Next Actions

The codebase has a clean TypeScript foundation, passing builds, and functioning core tests. However, it requires hardening before it can be deemed production-ready and securely self-hostable.

The most urgent findings (P0) center on:
1. Unauthenticated dashboard management and plaintext API key exposure.
2. Insecure proxy header trust leading to IP spoofing.
3. Hardcoded SQLite database provider without PostgreSQL migration support.
4. Unpatched critical CVEs in Next.js 14.

Work will proceed strictly through the hardening phases as specified. Phase 1 will address correctness, documentation truthfulness, runnable examples, dual module packaging, and regression evaluation refactoring.
