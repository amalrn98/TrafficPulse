import { TrafficClassifier, ClassificationResult } from '@trafficpulse/classifier';
import { dispatchEventWithRetry } from './dispatch';

export interface NextMiddlewareOptions {
  siteId: string;
  apiKey?: string;
  apiHost?: string;
  ignoredPaths?: string[];
  timeoutMs?: number;
  maxRetries?: number;
  onClassified?: (req: Request, classification: ClassificationResult) => void | Response;
}

export interface NextFetchEventLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * High-performance Next.js Edge Middleware for TrafficPulse.
 * Classifies traffic with zero added origin latency and async telemetry ingestion.
 * Strictly fail-open: any classifier error or network failure will never break the host site.
 */
export function withTrafficPulse(options: NextMiddlewareOptions) {
  const ignored = options.ignoredPaths || [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/api/v1/events',
  ];

  return async function middleware(req: Request, event?: NextFetchEventLike) {
    try {
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

      let classification: ClassificationResult;
      try {
        classification = TrafficClassifier.classify({
          userAgent: ua,
          ip,
          method: req.method,
          path: url.pathname,
          headers: headerRecord,
        });
      } catch {
        // Fail-open fallback if classifier throws unexpected error
        classification = {
          actorType: 'unknown',
          actorName: 'Unknown',
          activityType: 'unknown',
          verificationStatus: 'unknown',
          confidence: 0.0,
          confidenceType: 'heuristic',
          evidence: [],
          reasonCodes: [],
          classifierVersion: '1.0.0',
          classifiedAt: new Date().toISOString(),
          category: 'generic_bot',
          actorFamily: 'Unknown',
          intent: 'unknown',
          verifiedOrigin: false,
          signals: [],
        };
      }

      // Optional user hook for bot gating / rate limiting
      if (options.onClassified) {
        try {
          const customResponse = options.onClassified(req, classification);
          if (customResponse) return customResponse;
        } catch {
          // Fail-open: hook errors do not terminate the request
        }
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

        // Register background promise with NextFetchEvent.waitUntil when running on Edge runtimes
        const dispatchPromise = dispatchEventWithRetry({
          apiHost: options.apiHost,
          siteId: options.siteId,
          apiKey: options.apiKey,
          payload,
          timeoutMs: options.timeoutMs,
          maxRetries: options.maxRetries,
        }).catch(() => {});

        if (event && typeof event.waitUntil === 'function') {
          event.waitUntil(dispatchPromise);
        }
      }
    } catch {
      // Ultimate fail-open guard
      return;
    }
  };
}
