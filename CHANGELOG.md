# Changelog

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://www.conventionalcommits.org/) for commit guidelines.

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

