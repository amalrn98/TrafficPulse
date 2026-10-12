import { TrafficClassifier, ClassificationResult } from '@trafficpulse/classifier';

export interface NextMiddlewareOptions {
  siteId: string;
  apiKey?: string;
  apiHost?: string;
  ignoredPaths?: string[];
  onClassified?: (req: Request, classification: ClassificationResult) => void | Response;
}

/**
 * High-performance Next.js Edge Middleware for TrafficPulse.
 * Classifies traffic with zero added origin latency and async telemetry ingestion.
 */
export function withTrafficPulse(options: NextMiddlewareOptions) {
  const ignored = options.ignoredPaths || [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/api/v1/events',
  ];

  return async function middleware(req: Request) {
    const url = new URL(req.url);

    // Bypass static asset requests
    if (ignored.some((path) => url.pathname.startsWith(path))) {
      return;
    }

    const ua = req.headers.get('user-agent') || '';
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '';

    const headerRecord: Record<string, string> = {};
    req.headers.forEach((val, key) => {
      headerRecord[key] = val;
    });

    const classification = TrafficClassifier.classify({
      userAgent: ua,
      ip,
      method: req.method,
      path: url.pathname,
      headers: headerRecord,
    });

    // Optional user hook for bot gating / rate limiting
    if (options.onClassified) {
      const customResponse = options.onClassified(req, classification);
      if (customResponse) return customResponse;
    }

    // Non-blocking asynchronous dispatch to TrafficPulse Ingestion API
    if (options.siteId && options.apiHost) {
      const idempotencyKey = `mw_next_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const payload = {
        siteId: options.siteId,
        idempotencyKey,
        path: url.pathname,
        method: req.method,
        userAgent: ua,
        referer: req.headers.get('referer') || undefined,
        timestamp: new Date().toISOString(),
      };

      const ingestUrl = `${options.apiHost.replace(/\/$/, '')}/api/v1/events`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      };
      if (options.apiKey) {
        headers['Authorization'] = `Bearer ${options.apiKey}`;
      }

      fetch(ingestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  };
}
