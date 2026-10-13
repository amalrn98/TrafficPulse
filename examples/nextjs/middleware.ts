/**
 * Example: Next.js Edge Middleware integration
 *
 * Usage: copy to middleware.ts at the root of your Next.js project.
 * This captures non-JavaScript scrapers and crawlers before rendering.
 *
 * Required env vars:
 *   TRAFFICPULSE_SITE_ID   - Your registered site ID
 *   TRAFFICPULSE_API_KEY   - Your site API key
 *   TRAFFICPULSE_API_HOST  - URL of your TrafficPulse instance
 */
import { withTrafficPulse } from '@trafficpulse/middleware';

export default withTrafficPulse({
  siteId: process.env.TRAFFICPULSE_SITE_ID!,
  apiKey: process.env.TRAFFICPULSE_API_KEY!,
  apiHost: process.env.TRAFFICPULSE_API_HOST || 'https://analytics.yourcompany.com',
  onClassified: (req, classification) => {
    // Optional defense hook.
    // Use actorType from the documented taxonomy:
    //   'human_browser' | 'ai_crawler' | 'ai_agent' | 'search_crawler' | 'automation_tool' | 'unknown'
    if (classification.actorType === 'automation_tool' && classification.verificationStatus !== 'verified') {
      // Block unverified automation tools if desired.
      // Return undefined to allow through instead.
      // return new Response('Access Denied', { status: 403 });
    }
  },
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
