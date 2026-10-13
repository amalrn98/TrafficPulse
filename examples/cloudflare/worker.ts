/**
 * Example: Cloudflare Workers integration
 *
 * Deploy with: wrangler deploy
 *
 * Required Cloudflare Secrets (set via wrangler secret put):
 *   TRAFFICPULSE_SITE_ID   - Your registered site ID
 *   TRAFFICPULSE_API_KEY   - Your site API key
 *   TRAFFICPULSE_API_HOST  - URL of your TrafficPulse instance
 */
import { trafficPulseWorker } from '@trafficpulse/middleware';

interface Env {
  TRAFFICPULSE_SITE_ID: string;
  TRAFFICPULSE_API_KEY: string;
  TRAFFICPULSE_API_HOST: string;
}

export default {
  fetch: trafficPulseWorker(
    async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
      // Your existing worker handler goes here.
      // The classification is available via request.headers:
      //   X-TrafficPulse-ActorType
      //   X-TrafficPulse-Verification
      //   X-TrafficPulse-Category (legacy)
      return new Response('Hello from Cloudflare Worker with TrafficPulse', {
        headers: { 'Content-Type': 'text/plain' },
      });
    },
    {
      siteId: 'YOUR_SITE_ID', // Replace with env.TRAFFICPULSE_SITE_ID in production
      apiKey: 'YOUR_API_KEY',
      apiHost: 'https://analytics.yourcompany.com',
    }
  ),
};
