# Configuration Reference

Complete reference of all environment variables supported by TrafficPulse components.

## Dashboard Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | String | `file:./dev.db` (development only) | Prisma database connection URL (PostgreSQL for production, SQLite for local dev). **Required in production**: the server refuses to start without it. |
| `ADMIN_API_KEY` | String | *Required in prod* | Secret token for admin authentication, site management, and analytics queries. |
| `METRICS_AUTH_TOKEN` | String | Value of `ADMIN_API_KEY` | Bearer token required to scrape `/api/metrics`. |
| `METRICS_PUBLIC` | Boolean | `false` | When `true`, enables unauthenticated scraping on `/api/metrics` for internal VPC monitoring. |
| `TRUST_PROXY` | Boolean | `false` | When `true`, the client IP is read from `CF-Connecting-IP`, `X-Forwarded-For` or `X-Real-IP`. Only enable when every request passes through your own reverse proxy and the app port is not reachable directly. When `false`, no client IP is available for per-IP limits or IP verification. |
| `TRUSTED_PROXY_HOPS` | Number | `1` | Number of trusted proxies in front of the app. The client IP is the `X-Forwarded-For` entry this many positions from the right (the leftmost entries are client-controlled and ignored). Only used when `TRUST_PROXY=true`. |
| `REQUIRE_API_KEY` | Boolean | `false` | When `true`, every ingestion request must carry a valid site API key. This disables keyless browser beacons, so the JavaScript tracker stops working. Use it when events come only from server-side middleware. |
| `API_KEY_SALT` | String | *Built-in default* | Salt for API key hashing. Set a random value (`openssl rand -hex 16`) **before creating your first site**. Changing it later invalidates existing keys. |
| `INGEST_SITE_RPS` | Number | `300` | Sustained ingestion rate ceiling per site (requests per second). |
| `INGEST_SITE_BURST` | Number | `1200` | Burst allowance for the per-site ingestion ceiling. |
| `POSTGRES_PASSWORD` | String | *Required for docker compose* | Password for the bundled PostgreSQL service. `docker-compose.yml` builds `DATABASE_URL` from it. |
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
| `ignoredPaths` | Array | No | URL path prefixes to bypass without classification or telemetry logging. The Express adapter matches whole path segments (`/static` matches `/static/a.js`, not `/staticfoo`); the Next.js and Cloudflare adapters match plain string prefixes. |
| `trustForwardedFor` | Boolean | No | Express and Next.js only. Whether to read the visitor IP from `X-Forwarded-For` / `X-Real-IP`. **Express default: `false`** (the socket address is used). **Next.js default: `true`**, because Next middleware has no socket address; set `false` if clients can reach your server directly. When enabled, the rightmost entry (appended by your own proxy) is used, not the client-supplied leftmost one. Cloudflare Workers always use `CF-Connecting-IP`. |
| `onClassified` | Function | No | Custom defense hook called immediately after classification (e.g. for blocking bots). |

Server-side middleware forwards the visitor IP and a few request headers (`accept`, `accept-language`, `sec-ch-ua`) with each event. The dashboard uses them **only when the request carries a valid API key**; keyless requests are classified from the connection itself.

## Client Tracker Configuration

Attributes accepted by the `<script>` tag or constructor options for `TrafficPulseTracker`:

| Attribute | Type | Default | Description |
|---|---|---|---|
| `data-site-id` | String | *Required* | Site identifier. |
| `data-api-host` | String | Host origin | Ingestion API base URL. The tracker appends `?siteId=` to the events URL so the server can answer the CORS preflight for the right domain. |
| `data-auto-track` | Boolean | `true` | Automatically track page views on load. |
| `data-respect-dnt` | Boolean | `true` | Honor Do Not Track (DNT) and Global Privacy Control (GPC). |
| `data-enable-behavior` | Boolean | `false` | Opt-in to mouse/scroll entropy and WebGL telemetry (GDPR/ePrivacy compliant). |
| `data-disable-biometrics` | Boolean | `true` | *Deprecated alias* for backward compatibility. |

