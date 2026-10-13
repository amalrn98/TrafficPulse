# TrafficPulse Threat Model

This document outlines the security architecture, trust boundaries, threat vectors, and mitigations implemented across TrafficPulse.

## Trust Boundaries

1. **Client / Browser Boundary**: All data received from client browsers or public web callers is strictly untrusted.
2. **Host Site Boundary**: Web applications consuming TrafficPulse middleware run in their own process spaces. Telemetry dispatch must not compromise host site availability.
3. **Database Boundary**: Direct database access is restricted to the dashboard backend. Raw API keys and admin credentials must never be written to logs or returned in list responses.

## Threats and Mitigations

| Threat Vector | Description | Implemented Mitigation |
|---|---|---|
| **Forged Client Classification** | Malicious clients submit fabricated `actorType` or `category` to disguise bot traffic. | Ingestion schema validation unconditionally strips all incoming classification claims. Classification is computed strictly server-side from verified evidence. |
| **IP Spoofing via Headers** | Attackers forge `X-Forwarded-For` or `X-Real-IP` to spoof legitimate search engine or AI crawler CIDRs. | Ingestion layer ignores proxy headers by default (`TRUST_PROXY=false`). Only when explicitly enabled behind a verified reverse proxy are forwarded headers parsed. |
| **Cross-Tenant Data Leakage** | Tenant A attempts to read or mutate analytics events belonging to Tenant B. | Every query requires explicit `siteId` scoping. Admin endpoints require `ADMIN_API_KEY` verification. API keys are hashed with SHA-256 and matched via database indexes. |
| **Denial of Service (DoS)** | Attackers flood ingestion API with massive JSON bodies or high-concurrency requests. | Strict 64 KB payload size cap (`MAX_PAYLOAD_BYTES`), pluggable rate limiting (token bucket / Redis), and bounded DB query timeouts. |
| **Telemetry Replay Attacks** | Attackers replay recorded tracking requests to skew dashboard traffic metrics. | Ingestion checks `X-Idempotency-Key`. Replayed submissions return HTTP 200 without creating duplicate database records or inflating counters. |
| **Host Site Cascading Failure** | TrafficPulse ingestion outage blocks or slows the client website. | Middleware adapters are non-blocking and fail-open. Requests time out after 3,000 ms, retry at most twice, and swallow errors silently. |
| **PII & Credential Leakage in Logs** | Sensitive tokens, user identifiers, or IP addresses appear in server logs. | Structured JSON logger automatically strips authorization headers, cookies, query strings, and masks IP addresses before outputting. |

