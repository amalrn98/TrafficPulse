# TrafficPulse Integration Examples

Runnable example integrations for each supported adapter.

## Next.js Edge Middleware

File: `examples/nextjs/middleware.ts`

Copy to `middleware.ts` in the root of your Next.js project:

```bash
cp examples/nextjs/middleware.ts <your-nextjs-project>/middleware.ts
```

Set environment variables:

```bash
export TRAFFICPULSE_SITE_ID="your-site-id"
export TRAFFICPULSE_API_KEY="tp_live_..."
export TRAFFICPULSE_API_HOST="https://analytics.yourcompany.com"
```

## Express.js

File: `examples/express/middleware.js`

Requires Node.js >= 20 and `@trafficpulse/middleware` installed:

```bash
npm install @trafficpulse/middleware
node examples/express/middleware.js
```

The Express adapter works with both CommonJS (`require`) and ES module bundlers.

## Cloudflare Workers

File: `examples/cloudflare/worker.ts`

Requires the Wrangler CLI:

```bash
npm install -g wrangler
wrangler secret put TRAFFICPULSE_SITE_ID
wrangler secret put TRAFFICPULSE_API_KEY
wrangler secret put TRAFFICPULSE_API_HOST
wrangler deploy
```

## Taxonomy Reference

All examples use the documented taxonomy fields. Do NOT use the legacy `category` field in new code:

| Field | Values |
|-------|--------|
| `actorType` | `human_browser`, `ai_crawler`, `ai_agent`, `search_crawler`, `automation_tool`, `unknown` |
| `verificationStatus` | `verified`, `claimed`, `inferred`, `unverified`, `unknown` |
| `activityType` | `page_view`, `content_fetch`, `api_query`, `unknown` |
| `confidence` | 0.00 to 1.00 (heuristic score, not calibrated probability) |

See the [Classification Taxonomy section](../README.md) for full descriptions.
