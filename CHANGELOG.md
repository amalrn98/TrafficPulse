# Changelog

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://www.conventionalcommits.org/) for commit guidelines.

## Unreleased

### Security

- **ingestion**: An invalid API key is now rejected (`401 INVALID_API_KEY`) instead of falling back to a `siteId` lookup, and presenting any `X-Api-Key` no longer skips the origin check. The key's site must match the payload `siteId` (`403 SITE_MISMATCH`). Keyless requests need a matching `Origin`. New `REQUIRE_API_KEY` setting.
- **proxy trust**: The client IP is the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` from the right (default 1), not the client-controlled leftmost entry. IP addresses are validated.
- **middleware (behavior change)**: The Express adapter no longer trusts `X-Forwarded-For` unless `trustForwardedFor: true`. All adapters forward the visitor IP and selected headers, which the dashboard honors only with a valid API key.
- **verified bots**: Vendor IP ranges replaced with the vendors' published lists (Google, OpenAI, Anthropic). Previously general Google infrastructure ranges counted as Googlebot and real crawler addresses were unverified. The loader fails safe instead of using stale built-in ranges. The refresh script now exits non-zero on failure and uses the correct Anthropic URL.
- **denial of service**: Asynchronous API key derivation with a format pre-check, request bodies limited while streaming, rate limiter memory bounded, and a per-site limiter applied after authentication.
- **admin auth**: Removed the unused cookie path. Placeholder secrets from `.env.example` are rejected in production.
- **dashboard**: `keyHash` is no longer returned by the analytics API; site domains are validated; Content-Security-Policy no longer allows `unsafe-eval` in production; the unused image optimizer is disabled.

### Fixes

- The browser tracker now sends `?siteId=` so the CORS preflight succeeds in production; disallowed origins no longer receive `Access-Control-Allow-Origin: null`.
- IPv6 masking now truncates compressed addresses to /64. Query strings and fragments are stripped from stored paths and referers.
- Prometheus histogram buckets were counted twice.
- `durationMs: 0` is stored as 0; concurrent requests with the same idempotency key return a duplicate instead of a 500.
- IPv4-mapped IPv6 addresses match IPv4 ranges. Tracker teardown no longer disturbs another tracker's `pushState` wrapper.

### Deployment

- `docker compose up` now creates the database tables (`db-init` job). `POSTGRES_PASSWORD` is required and the app binds to `127.0.0.1:3000`. The container health check uses the liveness endpoint.
- Kubernetes manifest creates the `trafficpulse` namespace; the NetworkPolicy example restricts ingress.
- CI uses least-privilege permissions and releases are gated on tests.

### Corrections to 0.1.0 notes

- API keys are derived with scrypt, not stored as plain SHA-256 hashes. The schema is applied with `prisma db push`; there are no committed migrations.

## 0.1.0 (2026-10-13)

### Features and Hardening

- **epistemic classifier**: Add heuristic confidence ceilings, precedence rules, and fallback to `unknown` when signals conflict.
- **data provenance**: Move hardcoded vendor CIDRs to versioned data file (`packages/classifier/data/ip-ranges.json`) with automated monthly refresh workflow.
- **privacy**: Make behavioral telemetry (mouse entropy, scroll entropy, WebGL renderer) opt-in by default via `enableBehavior`. Add Global Privacy Control (GPC) enforcement.
- **database lifecycle**: Add compound index `@@index([siteId, actorType])`, support PostgreSQL as production database, committed migration workflows, and data retention pruning jobs.
- **security**: Store API keys as SHA-256 hashes, guard admin analytics routes with `verifyAdminAuth`, scope CORS headers by registered site origin, add strict CSP and security headers, and eliminate PII from logs.
- **resilience**: Multi-runtime middleware adapters (Next.js, Express, Cloudflare Workers) strictly fail-open with bounded retries and 3,000 ms timeouts.
- **observability**: Structured JSON logging with request IDs and zero PII. Protected Prometheus exposition endpoint at `/api/metrics`.
- **deployment**: Pinned Dockerfile with Node 22 Alpine, unprivileged `nextjs` user, Next.js standalone build, separate DB-independent liveness health probe, and Kubernetes deployment manifests.

