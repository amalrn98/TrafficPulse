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
| **IP Spoofing via Headers** | Attackers forge `X-Forwarded-For` or `X-Real-IP` to spoof legitimate search engine or AI crawler CIDRs. | Ingestion ignores proxy headers by default (`TRUST_PROXY=false`). When enabled, the client IP is the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` from the right (leftmost entries are client-controlled) and addresses are validated. Server-side middleware ignores forwarded headers unless `trustForwardedFor` is set, and the dashboard accepts a reported visitor IP only with a valid API key. Never expose the app port directly when `TRUST_PROXY=true`. |
| **Cross-Tenant Data Leakage** | Tenant A attempts to read or mutate analytics events belonging to Tenant B. | Every query requires explicit `siteId` scoping. Admin endpoints require `ADMIN_API_KEY` verification. API keys are derived with scrypt (async, after a format check) and matched via database indexes; an invalid key is rejected, never downgraded to a site-ID lookup. |
| **Denial of Service (DoS)** | Attackers flood ingestion API with massive JSON bodies or high-concurrency requests. | Strict 64 KB payload size cap (`MAX_PAYLOAD_BYTES`), pluggable rate limiting (token bucket / Redis), and bounded DB query timeouts. |
| **Telemetry Replay Attacks** | Attackers replay recorded tracking requests to skew dashboard traffic metrics. | Ingestion checks `X-Idempotency-Key`. Replayed submissions return HTTP 200 without creating duplicate database records or inflating counters. |
| **Host Site Cascading Failure** | TrafficPulse ingestion outage blocks or slows the client website. | Middleware adapters are non-blocking and fail-open. Requests time out after 3,000 ms, retry at most twice, and swallow errors silently. |
| **PII & Credential Leakage in Logs** | Sensitive tokens, user identifiers, or IP addresses appear in server logs. | Structured JSON logger automatically strips authorization headers, cookies, query strings, and masks IP addresses before outputting. |
| **Event Injection / Data Poisoning** | A caller who knows a site's public `siteId` posts fabricated events. | Keyed requests must present a valid key for that site. Keyless browser beacons require a matching `Origin`, a per-IP limit and a per-site ceiling. Residual risk: a non-browser client can set any `Origin`; use `REQUIRE_API_KEY=true` when events come only from server-side middleware. |
| **Forged Client Signals** | A scraper reports high mouse entropy or interaction counts to be classified as human. | Client signals only adjust confidence or mark conflicting evidence; they are never treated as proof of a human. Treat `human_browser` results from keyless beacons as unverified. |
| **Authentication Cost DoS** | Attacker floods the API with random API keys to burn CPU on key derivation. | Keys that do not match the generated format skip the KDF, derivation is asynchronous (no event-loop blocking), per-IP and per-site limits apply, and failed derivations are never cached. |

