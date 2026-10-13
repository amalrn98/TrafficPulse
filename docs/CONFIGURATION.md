# Configuration Reference

Complete reference of all environment variables supported by TrafficPulse components.

## Dashboard Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | String | `file:./dev.db` | Prisma database connection URL (PostgreSQL for production, SQLite for local dev). |
| `ADMIN_API_KEY` | String | *Required in prod* | Secret token for admin authentication, site management, and analytics queries. |
| `METRICS_AUTH_TOKEN` | String | Value of `ADMIN_API_KEY` | Bearer token required to scrape `/api/metrics`. |
| `METRICS_PUBLIC` | Boolean | `false` | When `true`, enables unauthenticated scraping on `/api/metrics` for internal VPC monitoring. |
| `TRUST_PROXY` | Boolean | `false` | When `true`, honors `X-Forwarded-For` and `X-Real-IP` headers. Only enable behind trusted reverse proxies. |
| `REDIS_URL` | String | *None* | Redis connection string for distributed rate limiting across multiple instances. |
| `RETENTION_DAYS` | Number | `90` | Automatic data retention lifecycle limit in days. Events older than this are purged. |
| `PORT` | Number | `3000` | HTTP port on which the dashboard server listens. |
| `NODE_ENV` | String | `development` | Runtime environment (`production`, `development`, or `test`). |

## Middleware Configuration

Configuration options accepted by `withTrafficPulse` (Next.js), `createTrafficPulseMiddleware` (Express), and `trafficPulseWorker` (Cloudflare):

| Option | Type | Required | Description |
|---|---|---|---|
| `siteId` | String | Yes | Unique site identifier registered in TrafficPulse. |
| `apiKey` | String | No | Site API key for authenticated server-to-server dispatch. |
| `apiHost` | String | Yes | Base URL of your TrafficPulse instance (e.g., `https://analytics.company.com`). |
| `timeoutMs` | Number | No (Default: 3000) | Timeout for asynchronous telemetry dispatch. |
| `maxRetries` | Number | No (Default: 2) | Maximum retry attempts with exponential backoff on transient network failures. |
| `ignoredPaths` | Array | No | URL path prefixes to bypass without classification or telemetry logging. |
| `onClassified` | Function | No | Custom defense hook called immediately after classification (e.g. for blocking bots). |

## Client Tracker Configuration

Attributes accepted by the `<script>` tag or constructor options for `TrafficPulseTracker`:

| Attribute | Type | Default | Description |
|---|---|---|---|
| `data-site-id` | String | *Required* | Site identifier. |
| `data-api-host` | String | Host origin | Ingestion API base URL. |
| `data-auto-track` | Boolean | `true` | Automatically track page views on load. |
| `data-respect-dnt` | Boolean | `true` | Honor Do Not Track (DNT) and Global Privacy Control (GPC). |
| `data-enable-behavior` | Boolean | `false` | Opt-in to mouse/scroll entropy and WebGL telemetry (GDPR/ePrivacy compliant). |
| `data-disable-biometrics` | Boolean | `true` | *Deprecated alias* for backward compatibility. |

