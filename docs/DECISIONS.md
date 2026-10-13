# Architecture and Implementation Decisions

This document records architectural decisions, trade-offs, and defaults adopted during repository hardening.

## Decision Log

### DEC-001: Dual Database Support Strategy (PostgreSQL and SQLite)
- **Context**: The project currently uses SQLite with `provider = "sqlite"` in Prisma. Production self-hosting requires PostgreSQL with concurrent write throughput, row-level locking, and connection pooling. Local development benefits from zero-configuration SQLite.
- **Decision**: Configure PostgreSQL as the authoritative production database with committed migrations (`prisma/migrations`). Retain SQLite support for local rapid testing and development. Implement a modular schema migration approach ensuring clean schema synchronization for both engines.
- **Status**: Accepted (Phase 2).

### DEC-002: Server-Authoritative API Key Authentication
- **Context**: Site registration currently generates plaintext API keys stored directly in the database.
- **Decision**: Hash API keys using SHA-256 before persistence (`keyHash`). Return the raw API key only once upon site creation or key rotation. Require an admin authentication secret (`ADMIN_API_KEY` or admin session) to access dashboard management routes.
- **Status**: Accepted (Phase 3).

### DEC-003: Strict Proxy Header Evaluation
- **Context**: Previous implementation trusted `X-Forwarded-For` by default whenever `NODE_ENV === 'production'`.
- **Decision**: Require explicit opt-in via `TRUST_PROXY=true` and optional `TRUSTED_PROXY_IPS` CIDR validation to prevent client-side IP spoofing attacks.
- **Status**: Accepted (Phase 3).

### DEC-004: Regression Suite Framing for Classifier Fixtures
- **Context**: Previous documentation presented 19 test fixtures as a 100% accuracy evaluation benchmark.
- **Decision**: Refactor fixture reporting to describe regression suites rather than empirical model accuracy. Expand fixtures with adversarial and held-out test splits, and document heuristic score limitations.
- **Status**: Accepted (Phase 1).

### DEC-005: Privacy Default to Opt-In for Behavioral Signals
- **Context**: Client tracker collected mouse and scroll entropy and WebGL hints by default.
- **Decision**: In compliance with ePrivacy and GDPR consent principles, make behavioral telemetry and WebGL rendering hints opt-in by default. Honor both Do Not Track (`navigator.doNotTrack`) and Global Privacy Control (`navigator.globalPrivacyControl`).
- **Status**: Accepted (Phase 5).
