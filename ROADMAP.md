# TrafficPulse Project Roadmap

This document outlines planned improvements, milestones, and strategic directions for TrafficPulse.

## Current Milestone: v0.1.0 Production Readiness (Completed)

- [x] Epistemic traffic classifier with deterministic taxonomy and confidence caps.
- [x] Multi-runtime edge and server middleware (Next.js, Express, Cloudflare Workers).
- [x] Fail-open middleware resilience with timeouts and bounded retries.
- [x] Privacy compliance: opt-in behavioral signals, GPC enforcement, and IP masking.
- [x] Database lifecycle management: compound indexes, retention pruning, and PostgreSQL support.
- [x] Hardened Docker container (Node 22 LTS Alpine, non-root user, standalone output).
- [x] Structured JSON logging and Prometheus metrics endpoint (`/api/metrics`).

## Milestone: v0.2.0 Advanced Analytics & Threat Feeds

- [ ] Reverse-DNS verification integration for automated Googlebot and Bingbot PTR checks.
- [ ] Automated threat intelligence feed ingestion (AbuseIPDB, Project Honey Pot).
- [ ] Pluggable Redis cache for distributed rate limiting and deduplication at high scale.
- [ ] Configurable webhook alerts on detected scraper spikes or anomalous crawl velocity.
- [ ] SDK wrappers for Python (FastAPI/Django) and Go (chi/gin).

## Milestone: v0.3.0 Enterprise Fleet & Governance

- [ ] Role-Based Access Control (RBAC) with SSO / OIDC (Okta, GitHub, Google).
- [ ] Multi-region active-active deployment guide with read replicas.
- [ ] Export pipelines to ClickHouse, Snowflake, and BigQuery for long-term historical analytics.
- [ ] Real-time WebSocket streaming dashboard for live traffic inspection.

