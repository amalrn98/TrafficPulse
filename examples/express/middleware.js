/**
 * Example: Express.js middleware integration
 *
 * Works with both CommonJS (require) and ESM (import) projects.
 * For CommonJS:
 *   const { createTrafficPulseMiddleware } = require('@trafficpulse/middleware');
 * For ESM:
 *   import { createTrafficPulseMiddleware } from '@trafficpulse/middleware';
 *
 * Required env vars:
 *   TRAFFICPULSE_SITE_ID   - Your registered site ID
 *   TRAFFICPULSE_API_KEY   - Your site API key
 *   TRAFFICPULSE_API_HOST  - URL of your TrafficPulse instance
 */
'use strict';

const express = require('express');
const { createTrafficPulseMiddleware } = require('@trafficpulse/middleware');

const app = express();

// Drop-in middleware: attach classification to req.trafficPulse on every request.
app.use(
  createTrafficPulseMiddleware({
    siteId: process.env.TRAFFICPULSE_SITE_ID,
    apiKey: process.env.TRAFFICPULSE_API_KEY,
    apiHost: process.env.TRAFFICPULSE_API_HOST || 'http://localhost:3000',
    onClassified: (req, res, classification) => {
      // Use actorType from the documented taxonomy, not the legacy category field.
      // actorType: 'human_browser' | 'ai_crawler' | 'ai_agent' | 'search_crawler' | 'automation_tool' | 'unknown'
      if (classification.actorType === 'automation_tool' && classification.verificationStatus !== 'verified') {
        // Example: log unverified automation tools.
        console.log('[trafficpulse] automation_tool blocked:', classification.botIdentifier);
        // Uncomment to block:
        // res.status(403).json({ error: 'Access Denied' });
        // return true; // Return true to signal the middleware not to call next()
      }
    },
  })
);

app.get('/', (req, res) => {
  res.json({
    message: 'Hello from Express with TrafficPulse',
    // Classification is available on req.trafficPulse after middleware runs.
    actorType: req.trafficPulse?.actorType,
    verification: req.trafficPulse?.verificationStatus,
  });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Express example running on port ${port}`);
});
