---
"@trafficpulse/classifier": minor
"@trafficpulse/tracker": patch
"@trafficpulse/middleware": minor
"@trafficpulse/dashboard": minor
---

Security and correctness release following a full audit. Behavior changes: invalid API keys are rejected, the Express middleware ignores `X-Forwarded-For` unless `trustForwardedFor: true`, keyless ingestion requires a matching `Origin`, and `DATABASE_URL` is required in production. Vendor IP ranges are replaced with the vendors' published lists. See CHANGELOG.md.
