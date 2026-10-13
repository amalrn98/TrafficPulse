# TrafficPulse Production Readiness Audit

**Date:** 2026-10-13
**Auditor:** Hardening Engineer (Phase 0)
**Branch:** `hardening/production-readiness`
**Upstream remote:** `https://github.com/mythicavalon/TrafficPulse.git`
**Target repo stated in task:** `https://github.com/amalrn98/TrafficPulse`

This document records the complete baseline audit of the TrafficPulse codebase before any Phase 1+ changes. Every claim is backed by a command listed in Section 1 or by direct static analysis of the source files listed.

---

## 1. Baseline Commands and Exact Results

### 1.1 Repository State

```
Command: git remote -v; git log --oneline -5; git status
Result:
  origin  https://github.com/mythicavalon/TrafficPulse.git
  Branch: hardening/production-readiness (already active, 5 prior commits)
  Working tree: clean
Exit: 0
```

### 1.2 Dependency Installation

```
Command: npm install
Exit: 0
Warnings:
  - npm warn EBADENGINE package 'eslint-visitor-keys@5.0.1'
    required: { node: '^20.19.0 || ^22.13.0 || >=24' }
    current: { node: 'v20.18.0', npm: '10.8.2' }
  - 12 vulnerabilities reported (see 1.6)
Note: npm install does NOT copy package-lock.json into container build (Dockerfile uses npm install, not npm ci).
```

### 1.3 Monorepo Build

```
Command: npm run build
Exit: 0 (confirmed by background task log)
Packages built:
  @trafficpulse/classifier  -> tsc -> dist/
  @trafficpulse/tracker     -> tsc -> dist/
  @trafficpulse/middleware  -> tsc -> dist/
  @trafficpulse/dashboard   -> next build (Next.js 14.2.35)
Routes (dashboard):
  /                 8.83 kB
  /_not-found       873 B
  /api/health       0 B (route handler)
  /api/v1/analytics 0 B (route handler)
  /api/v1/events    0 B (route handler)
```

### 1.4 Linting

```
Command: npm run lint
Exit: 0
Result: Only dashboard has a lint script. 0 ESLint errors or warnings.
Note: classifier, tracker, middleware packages have no lint scripts; not checked by CI.
```

### 1.5 TypeScript Type-check (inferring from build success)

```
Command: npm run build (tsc runs inside each package build)
Exit: 0 for all packages.
Note: No standalone tsc --noEmit step is wired into CI; type errors would only surface via build.
```

### 1.6 Test Suite

```
Command: npm test
Exit: 0
Total: 33 tests passed, 0 failed.
  @trafficpulse/classifier : 12 tests (11 unit + 1 evaluation)
  @trafficpulse/middleware  :  3 tests
  @trafficpulse/tracker    :  3 tests
  @trafficpulse/dashboard  : 15 tests (6 DB, 3 rate-limit, 6 validation)
Evaluation benchmark output (from stdout):
  Macro Precision: 1.000 | Macro Recall: 1.000 | Macro F1: 1.000
  Overall Accuracy: 100.0% (19/19)
  Verification Match: 100.0% (19/19)
Note: Evaluation runs against compiled fixtures, not a held-out set. See DOC-03.
```

### 1.7 Security Audit

```
Command: npm audit --json
Exit: 1 (vulnerabilities present)
Summary: 1 critical, 9 high, 2 moderate = 12 total
Affected package: next@14.2.35 (all vulns route through it and its bundled postcss)
Critical CVEs:
  GHSA-p293-qw3h-jr36  Next.js: Unauthenticated RCE on windows-hosted servers
                        CVSS 9.0  range: >=13.4.0 <15.5.24
  GHSA-2xp9-vwfh-vxw4  Next.js: Unauthenticated RCE in Image Optimization (AVIF)
                        range: >=10.0.0 <15.5.24
High CVEs:
  GHSA-p9j2-gv94-2wf4  Next.js: SSRF via attacker-controlled rewrite hostname
  GHSA-6g55-p6wh-862q  PostCSS: Arbitrary file read via sourceMappingURL
  GHSA-r28c-9q8g-f849  PostCSS: Path traversal via sourceMappingURL
  GHSA-qx2v-qp2m-jg93  PostCSS: XSS via unescaped </style>
  GHSA-fxqj-rqcc-2cmp  PostCSS: Incomplete fix of GHSA-6g55
  GHSA-rj75-hqrm-r3gf  postcss-selector-parser: Quadratic complexity CPU exhaustion
  GHSA-4633-3j49-mh5q  Next.js: Cache confusion via invalid UTF-8
  GHSA-4c39-4ccg-62r3  Next.js: Unbounded server action payload (Edge runtime)
Moderate CVEs:
  GHSA-955p-x3mx-jcvp  Next.js: Unauthenticated disclosure of server function endpoints
Fix: npm audit fix --force upgrades next to 16.4.0 (semver major). Manual upgrade required.
```

### 1.8 Outdated Dependencies

```
Command: npm outdated
Key packages:
  next            installed 14.2.35  latest 16.4.0   (2 major versions behind, CRITICAL CVEs)
  @prisma/client  installed  5.22.0  latest  6.19.3  (1 major version behind)
  prisma          installed  5.22.0  latest  6.19.3
  tailwindcss     installed  3.4.19  latest  4.3.3   (1 major version behind)
  eslint          installed  8.57.0  latest  9.39.5  (1 major version behind)
  react           installed  18.3.1  latest 19.3.0   (1 major version behind)
  typescript      installed   5.9.3  latest  7.0.2   (2 major versions behind)
Node runtime: v20.18.0 (LTS). Container target should be pinned to Node 22 LTS per task spec.
```

---

## 2. Complete File-by-File Static Analysis

### 2.1 Repository Root

| File | Observation |
|------|-------------|
| `package.json` | Workspace root. No `engines` field to enforce Node version. |
| `Dockerfile` | Uses `node:20-alpine` (unpinned minor). Runs as root. No non-root user. Uses `npm install` (not `npm ci`). Does NOT copy `package-lock.json` before `npm install`. Copies entire builder stage (`COPY --from=builder /app ./`) including dev dependencies and test files. No `.dockerignore` exists. No standalone output mode. No startup migration. No HEALTHCHECK in Dockerfile (only in docker-compose). |
| `docker-compose.yml` | Has deprecated `version: '3.8'` key. No PostgreSQL service. No Redis service. No `env_file`. No resource limits. No `depends_on` with condition. No separate dev compose. |
| `README.md` | Badges point to `mythicavalon/TrafficPulse` not `amalrn98/TrafficPulse`. Build badge is a static SVG (`img.shields.io/badge/build-passing`), not a live GitHub Actions status badge. Next.js middleware example at line 111 checks `classification.category === 'generic_bot'` which does NOT exist in the documented taxonomy (taxonomy uses `actorType: 'automation_tool'`). Express example uses `require()` but package only exports CJS (no `exports` map, no dual build). Benchmark section presents 19/19 = 100% as "accuracy" not as a regression suite. |
| `SECURITY.md` | Email is `amal.nair.dev@users.noreply.github.com` (GitHub noreply, cannot receive email from external senders). No GitHub Security Advisory process referenced. No CVE/CWE response timeline. No PGP key. |
| `CONTRIBUTING.md` | Exists. No issue/PR templates for standardized contribution. |
| `LICENSE` | Apache-2.0. Present and correct. |
| `package-lock.json` | Present. Required for `npm ci`. But Dockerfile does NOT copy it before `npm install`. |

### 2.2 `packages/classifier`

| File | Observation |
|------|-------------|
| `src/types.ts` | Well-typed. `REASON_CODES` is an object of string constants - correct. `TrafficCategory` type includes `'generic_bot'` as legacy - this is what README erroneously references in `onClassified` example. |
| `src/signatures.ts` | 38 bot rules. All hardcoded regex. `FacebookBot` is classified as `llm_training`/`data_harvest` which is debatable. `DeveloperTool` actor family shares between Diffbot, Python-HTTP-Client, CLI-Tool, Script-HTTP-Client, PostmanRuntime - unclear separation of intent. No version/date stamp on the signatures database. |
| `src/ip-ranges.ts` | 5 vendor CIDR sets hardcoded in source. Source URLs present but `lastUpdated: '2026-03-01'` for ALL vendors (same date, suspicious - likely placeholder). No validation that CIDRs are valid format. `parseIpv4` / `parseIpv6` / `isIpInCidr` / `matchIpToCidrs` / `verifyIpOrigin` / `inspectIpOrigin` all implemented correctly. IPv6 zone index stripping correct. IPv4-mapped IPv6 handling present. Edge case: CIDR prefix 0 returns `true` (correct for `0.0.0.0/0`). `missing < 1` check in IPv6 `::` expansion catches over-expanded addresses. |
| `src/classifier.ts` | BUG (CLS-02): When `CONFLICTING_SIGNALS` is detected (bot signature + high mouse entropy), the function adds the reason code but still returns the bot classification - it does NOT fall back to `unknown`. The task specification requires `unknown` when evidence conflicts. Line 104-107: conflict detected, but the `return` at line 109 still returns the bot classification. Confidence can reach 0.75 without CIDR verification (CLS-03). |
| `src/index.ts` | Re-exports all public types and classifier. |
| `package.json` | No `exports` map. `main` points to `dist/src/index.js`. No `types` field for TypeScript consumers. No dual ESM/CJS build. |
| `tests/classifier.test.ts` | 11 well-structured unit tests. Tests cover CIDR verification, spoofed IPs, adversarial biometrics, header anomalies, empty UA, unknown clients, determinism. Good coverage. |
| `tests/evaluation.test.ts` | 19 fixture samples with confusion matrix computation. Still labeled as "BENCHMARK" in console output and asserts thresholds >= 0.90. The README presents the 100% result as "Overall Accuracy" not as "Regression Suite". Fixtures are not split into train/test - all 19 are also the classifier's own design targets. |

### 2.3 `packages/tracker`

| File | Observation |
|------|-------------|
| `src/index.ts` | `disableBiometrics` option is opt-out framing (collect by default, disable via flag). Should be opt-in for GDPR/ePrivacy compliance (PRV-01). Does NOT check `navigator.globalPrivacyControl` (PRV-02). WebGL `getWebGLRenderer()` fires unconditionally when `disableBiometrics` is false - no separate `disableWebGL` option. `keydown` listener counts interactions but correctly does NOT log key contents. Idempotency key generation uses `Math.random()` (not cryptographically secure but acceptable for dedup). Tracker sends to `apiHost + '/api/v1/events'` but apiHost is not validated or sanitized. SPA navigation via `history.pushState` monkey-patching is fragile but common pattern. No timeout on `fetch` fallback. |
| `package.json` | No `exports` map. |

### 2.4 `packages/middleware`

| File | Observation |
|------|-------------|
| `src/express.ts` | `fetch(ingestUrl, ...).catch(() => {})` - fire and forget, no timeout, no retry, no bounded backoff (NET-01). Trusts `x-forwarded-for` leftmost IP without any proxy trust configuration - can be spoofed by client (SEC-03 in middleware context). `options.onClassified` return value check: `if (handled) return;` - if `handled` is a falsy object (edge case), next() is still called. Correct for common use. |
| `src/nextjs.ts` | Same timeout/fail-open issue as express (NET-01). IP extraction from `x-forwarded-for` without proxy trust configuration. `options.onClassified` must return a `Response` to short-circuit; undefined/void continues. `keepalive: true` on fetch is good for page unload scenarios. |
| `src/cloudflare.ts` | (Not yet read - reading next) |
| `package.json` | `main: './dist/middleware/src/index.js'` - only CJS. No `exports` map. No `module` field for ESM. The README Express example uses `require('@trafficpulse/middleware')` which should work with CJS `main`. But the README Next.js example uses ESM `import` which works because Next.js bundles it. No proper dual build. (PKG-01) |
| `tsconfig.json` | (Not yet checked - reading separately) |

### 2.5 `apps/dashboard`

| File | Observation |
|------|-------------|
| `src/app/api/v1/events/route.ts` | CORS: `buildCorsHeaders` reflects any origin when `origin` is present (`allowedOrigin = origin \|\| '*'`). This is effectively wildcard CORS - any domain can POST events. No check against registered site domain. (SEC-05). Payload size check uses `Content-Length` header only - an attacker can omit `Content-Length` and stream an unlimited body. Should read body with a size limit. Step 5 site auth: `getSiteById(payload.siteId)` is tried first, then `getSiteByApiKey(candidateApiKey)` only if site not found - this means any request with a valid siteId but wrong API key is accepted without authentication. (SEC-01). `getSiteByApiKey` does a plaintext lookup (SEC-02). |
| `src/app/api/v1/analytics/route.ts` | GET handler: NO authentication. Any unauthenticated caller can read all analytics for any site by passing `?siteId=`. POST handler: NO authentication. Anyone can register a new site, receive an API key in the response. `site` response includes `apiKey` plaintext (SEC-02). (SEC-01). |
| `src/app/api/health/route.ts` | Only a readiness probe (queries DB). No separate liveness probe (should not query DB). OPS-03 confirmed. |
| `src/lib/db.ts` | `SiteRecord` interface includes `apiKey: string` which is returned to callers. `getOrCreateSite` returns the raw key. `getSiteByApiKey` does `findUnique({ where: { apiKey } })` - plaintext key in DB (SEC-02). `listSites` returns all sites including their raw API keys. `clientHints` typed as `any` (line 28) - minor hygiene. All analytics queries correctly scope by `siteId` and `isDemo` - tenant isolation at query level is present. No data retention / purge mechanism (DAT-03). `getTimeseries` fetches all matching events into memory then buckets in JS - for large datasets this is a performance issue. |
| `src/lib/ip-utils.ts` | BUG (SEC-03): Line 6: `const trustProxy = process.env.TRUST_PROXY === 'true' \|\| process.env.NODE_ENV === 'production'`. When `NODE_ENV=production`, proxy headers are ALWAYS trusted even if no reverse proxy is configured. An attacker running without a proxy can spoof `X-Forwarded-For` to inject any IP, bypassing CIDR verification. The OR with `NODE_ENV` must be removed; only `TRUST_PROXY=true` should enable header trust. |
| `src/lib/rate-limit.ts` | In-memory only. State is lost on restart. No distributed backend (Redis). For multi-instance deployments, each instance has an independent bucket - limits are per-process, not per-cluster. `maxTokens: 120`, `refillRatePerSec: 30` - README says "120 token burst, 30 req/sec refill" which matches. (SEC-06). |
| `src/lib/validation.ts` | Client-supplied classification fields are correctly discarded (not in `ValidatedIngestEvent` interface). `clientSignals.key / keys / keystrokes / inputs` rejection is present and correct. Timestamp bounds: +24h future, -7 days past. idempotencyKey max 128 chars. siteId max 64 chars, alphanumeric+_-. Path max 2048 chars. UA max 1024 chars. `webglRenderer` max 128 chars. All bounds look reasonable. |
| `prisma/schema.prisma` | Provider: `sqlite`. Production requires PostgreSQL (DAT-01). No committed migrations directory - `db:push` is used (DAT-02). Indexes present: `[siteId, isDemo, timestamp]`, `[siteId, timestamp]`, `[trafficCategory]`, `[actorType]`, `[botIdentifier]`. Unique constraint `[siteId, idempotencyKey]` correct. `apiKey @unique` supports plaintext lookup but should be replaced with `keyHash` + SHA-256. `Site` model has no `apiKeyCreatedAt` or `isRevoked` field - no key rotation support. |
| `next.config.mjs` | `reactStrictMode: true`. `transpilePackages: ['@trafficpulse/classifier']`. No security headers (CSP, HSTS, X-Content-Type-Options, etc.) (SEC-07). No standalone output mode (needed for efficient Docker image). |
| `scripts/seed-demo.mjs` | Seed script. Not guarded against running in production (DAT-04 - minor but could populate demo data in prod if accidentally run). No `NODE_ENV` check. |
| `tests/db.test.mjs` | Tests DB persistence, idempotency, tenant isolation, demo isolation, time bucketing. Uses in-process SQLite. No PostgreSQL integration tests. |
| `tests/rate-limit.test.mjs` | Tests burst, rejection, key isolation. Good. |
| `tests/validation.test.mjs` | Tests valid payload, classification stripping, invalid siteId, invalid method, timestamp bounds, keystroke prohibition. Good. |

### 2.6 GitHub Actions

| File | Observation |
|------|-------------|
| `.github/workflows/ci.yml` | Node version: 20 (should be 22 per task spec). Uses `npm install` not `npm ci`. `DATABASE_URL: "file:./dev.db"` - SQLite only, no PostgreSQL service container. Redundant build step: `npm run build` (step 33-34) followed by `npm run build --workspace=@trafficpulse/dashboard` (step 39-40). No `npm audit` step. No CodeQL. No Dependabot configuration. No Trivy scan. No secret scanning. No coverage enforcement. No Playwright e2e. |

---

## 3. Ranked Findings

### P0 - Blocks Production

| ID | Component | Finding |
|----|-----------|---------|
| **SEC-01** | `analytics/route.ts` | Missing authentication on analytics API. Unauthenticated GET exposes all sites and cross-tenant analytics data. Unauthenticated POST creates sites and returns raw API keys. |
| **SEC-02** | `db.ts`, `schema.prisma`, `analytics/route.ts` | Raw API keys stored in plaintext in the database. `listSites()` returns all keys. `POST /analytics` returns the raw key. Keys must be SHA-256 hashed; raw key returned only once at creation. |
| **SEC-03** | `ip-utils.ts` | `NODE_ENV === 'production'` enables proxy header trust unconditionally. Attackers without a proxy can spoof `X-Forwarded-For` to inject arbitrary IPs and defeat CIDR verification of known crawlers. |
| **SEC-04** | `package-lock.json` | Next.js 14.2.35 has 2 critical RCE CVEs (GHSA-p293-qw3h-jr36 CVSS 9.0, GHSA-2xp9-vwfh-vxw4). Must upgrade to >=15.5.24. |
| **SEC-05** | `events/route.ts` | CORS reflects any caller origin. No check against the registered site's domain. Any webpage on any domain can beacon events and be attributed to a victim's siteId. |
| **DAT-01** | `schema.prisma` | Hardcoded SQLite provider. Production requires PostgreSQL with proper transaction isolation and concurrent write throughput. |
| **DAT-02** | `package.json` (dashboard) | `db:push` used for schema management. No committed Prisma migrations. Production schema changes could cause data loss. |
| **OPS-01** | `Dockerfile` | Runs as root. No non-root user. No `npm ci`. `package-lock.json` not copied before install. Full dev dependencies and source files included in final image. No Next.js standalone output. No startup migration. No HEALTHCHECK directive. |

### P1 - Correctness, Privacy, Resilience

| ID | Component | Finding |
|----|-----------|---------|
| **DOC-01** | `README.md` | Static build badge (`img.shields.io/badge/build-passing`) instead of live GitHub Actions status badge. Badge URLs point to `mythicavalon/TrafficPulse` not the target repo. |
| **DOC-02** | `README.md` L111 | `onClassified` example checks `classification.category === 'generic_bot'`. The `generic_bot` TrafficCategory is a backward-compat field, not the primary taxonomy. Documented taxonomy uses `actorType: 'automation_tool'`. Example is misleading and uses an undocumented field name in the hook signature. |
| **DOC-03** | `README.md`, `evaluation.test.ts` | 19-fixture evaluation labeled as "accuracy benchmark" with "100% accuracy". Fixtures are the same ones used to design the classifier - not a held-out test set. No adversarial OOD samples not already covered by signatures. Must be reframed as a regression suite with documented methodology. |
| **PKG-01** | `middleware/package.json` | No `exports` map. No dual ESM/CJS build. Only `main` field for CJS. TypeScript consumers get no `types` field at package root. |
| **CLS-02** | `classifier.ts` L104-127 | When bot signature matches AND mouse entropy > 1.2 (conflicting signals), the code adds `CONFLICTING_SIGNALS` reason code but still returns the bot classification at full confidence. Should return `unknown` or lower confidence when evidence is contradictory. |
| **CLS-03** | `classifier.ts` L74, 91 | Confidence of 0.75 is assigned for signature match without IP verification. No formal cap enforcement by evidence tier documented or tested. |
| **CLS-01** | `ip-ranges.ts` | All 5 vendor CIDR sets have `lastUpdated: '2026-03-01'` (same date, likely placeholder). No refresh automation. No validation that each CIDR string is correctly formatted at load time. No IPv4-only vs IPv6-only enforcement per vendor. |
| **PRV-01** | `tracker/src/index.ts` | `disableBiometrics` defaults to `false` (collect by default). WebGL renderer is collected unconditionally when biometrics not disabled. Opt-in should be the default for GDPR/ePrivacy signals. `disableBiometrics` naming is inverted (should be `enableBehavior`). |
| **PRV-02** | `tracker/src/index.ts` L90-96 | `navigator.globalPrivacyControl` is not checked. Only DNT is honored. GPC is a legally significant signal in CCPA-implementing states. |
| **PRV-03** | `docs/` | No `PRIVACY.md` documenting what is collected, stored, how IPs are masked, retention periods, or legal considerations. |
| **DAT-03** | `db.ts` | No data retention job. Event table grows unbounded. No 90-day default purge. No per-site deletion mechanism. |
| **SEC-06** | `rate-limit.ts` | In-memory only rate limiter. Multi-instance deployments have independent buckets. No Redis adapter. |
| **SEC-07** | `next.config.mjs` | No Content Security Policy. No HSTS, X-Content-Type-Options, X-Frame-Options, Permissions-Policy headers. |
| **NET-01** | `middleware/src/*.ts` | No timeout on `fetch(ingestUrl, ...)` in express.ts, nextjs.ts, cloudflare.ts. No retry with bounded backoff. A hung ingestion server blocks no request lifecycle (fire-and-forget), but a DNS hang can block. No documented fail-open guarantee. |
| **OPS-02** | `docker-compose.yml` | Deprecated `version: '3.8'` key. No PostgreSQL service. No Redis service. No `env_file`. No resource limits. No health condition dependency. No separate `docker-compose.dev.yml`. |
| **OPS-03** | `health/route.ts` | Single endpoint queries DB. If DB is slow, Kubernetes liveness probe restarts healthy containers. Liveness must be DB-free; current endpoint is readiness only. |
| **OBS-01** | `apps/dashboard/src/app/api/` | No structured JSON logging. No request IDs. `console.error` used without request context. No Prometheus `/metrics` endpoint. |
| **TST-01** | `.github/workflows/ci.yml` | No PostgreSQL service container. No integration tests against real Postgres. No Playwright e2e. No CodeQL. No Dependabot. No `npm audit` step in CI. No coverage thresholds. |

### P2 - Hygiene and Maintenance

| ID | Component | Finding |
|----|-----------|---------|
| **HYG-01** | `ci.yml` | Redundant build step (`npm run build` on line 34 and `npm run build --workspace=dashboard` on line 40). |
| **HYG-02** | `.dockerignore` | File does not exist. Docker build context includes `node_modules/`, `.git/`, `dist/`, test files, etc. |
| **HYG-03** | `SECURITY.md` | Email is a GitHub noreply address that cannot receive external email. No GitHub Security Advisory workflow. No PGP key offered. |
| **HYG-04** | Root | Missing: `CODE_OF_CONDUCT.md`, `CODEOWNERS`, `ROADMAP.md`, OpenAPI spec, architecture docs, self-hosting guide, threat model. |
| **HYG-05** | Root | No Changesets setup. No CHANGELOG. No automated versioning workflow. |
| **HYG-06** | CI | Node 20 in CI; task spec requires Node 22 LTS. `npm install` in CI should be `npm ci` for reproducibility. |
| **HYG-07** | `db.ts` L28 | `clientHints: any` - should be typed to `ClientTelemetrySignals \| null`. |
| **HYG-08** | `seed-demo.mjs` | No `NODE_ENV !== 'production'` guard. Running in prod would pollute with demo data. |
| **HYG-09** | `package.json` (classifier, tracker, middleware) | No `engines` field to declare minimum Node version. |
| **HYG-10** | `classifier/package.json` | No `types` field; TypeScript consumers must discover types from `main`. Should add `"types": "./dist/src/index.d.ts"`. |

---

## 4. README Claims vs. Code Reality

| README Claim | Reality |
|-------------|---------|
| "19/19 = 100% accuracy" | Evaluated against the same 19 fixtures used to build the classifier. Not a held-out set. Misleading accuracy framing. |
| `classification.category === 'generic_bot'` in onClassified hook | `category` is the legacy `TrafficCategory` field. The documented taxonomy is `actorType: 'automation_tool'`. |
| "Build Status: passing" (static badge) | Not backed by live CI run. Static SVG badge. |
| Badge URLs point to `mythicavalon/TrafficPulse` | Repository is `amalrn98/TrafficPulse` per task spec. |
| Express example: `require('@trafficpulse/middleware')` | Package has no explicit `exports` map. CJS `main` field exists so require works, but no dual-module support documented. |
| "120 token burst, 30 req/sec refill" | Correct per `rate-limit.ts` L84-87. |
| "64KB payload limit" | Correct per `events/route.ts` L8. |
| "Timestamps outside [-7 days, +24 hours] receive 400" | Correct per `validation.ts` L112-113. |
| "Client-submitted classification fields are untrusted and completely ignored" | Correct - `ValidatedIngestEvent` excludes them and server re-classifies. |
| "Database-Level Tenant Isolation" | Correct at query level - all queries filter by siteId. |
| "Idempotent Ingestion" | Correct - unique constraint on (siteId, idempotencyKey). |
| "Privacy IP Masking" | Correct - last octet zeroed for IPv4, /64 truncated for IPv6. |
| "CSP and security headers" (implied by Security section) | No CSP or security headers in next.config.mjs. |

---

## 5. Summary of P0 Findings and Remediation Plan

The codebase has a sound TypeScript foundation, good test coverage of the classifier, correct tenant isolation at the query level, and a well-structured epistemic classification model. However, it has 8 P0 blockers that prevent production deployment:

1. **SEC-01/02**: No auth on analytics API; plaintext API keys in DB and API responses. Fix: add admin authentication, hash API keys with SHA-256, never return raw keys after creation.
2. **SEC-03**: Proxy trust tied to `NODE_ENV=production` enables IP spoofing. Fix: remove OR condition, require explicit `TRUST_PROXY=true`.
3. **SEC-04**: Critical RCE CVEs in Next.js 14. Fix: upgrade to Next.js 15.5.24+ (minimum) or 16.4.0.
4. **SEC-05**: Wildcard CORS on ingestion endpoint. Fix: validate origin against registered site domain.
5. **DAT-01/02**: SQLite only, no committed migrations. Fix: add PostgreSQL support, commit migrations.
6. **OPS-01**: Insecure, bloated Dockerfile. Fix: non-root user, npm ci, standalone output, startup migration.

Phases 1-9 will address all findings in order. No finding will be marked "fixed" without a command proving the fix.

---

## 6. Items Requiring Human Decision (Cannot Be Automated)

1. **Legal review of privacy**: Whether fingerprint-like signals (WebGL renderer, interaction entropy) require GDPR Art. 5/6 consent or are covered under legitimate interest depends on jurisdiction and counsel. This audit flags them; legal review is needed before marking PRV-01 closed.
2. **Auth provider choice**: Phase 3 will implement admin authentication. Whether to use NextAuth.js, a custom JWT, or a third-party IdP (Auth0, Clerk) needs a human decision on deployment constraints.
3. **Release naming**: When to cut v0.1.0 (only after all P0 findings closed) is a maintainer decision. The current `version: 1.0.0` in packages implies GA readiness that does not exist.
4. **Target repository**: The task references `amalrn98/TrafficPulse` but the local remote is `mythicavalon/TrafficPulse`. Badge URLs and workflow triggers must be updated to match whichever is the canonical upstream. A human must confirm the target GitHub organization.
5. **Perplexity CIDR provenance**: The Perplexity entry in `ip-ranges.ts` cites "Perplexity published ASN / IP blocks" without a URL. Verification of those CIDRs requires accessing Perplexity's current documentation.
