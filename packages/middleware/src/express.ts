import { TrafficClassifier, ClassificationResult } from '@trafficpulse/classifier';
import { dispatchEventWithRetry, pickVisitorHeaders } from './dispatch';

export interface ExpressMiddlewareOptions {
  siteId: string;
  apiKey?: string;
  apiHost?: string;
  ignoredPaths?: string[];
  /**
   * Trust X-Forwarded-For for the visitor IP. Only enable when the app sits behind a proxy
   * that overwrites or appends the header. Default false: the socket address is used, because
   * a client-supplied X-Forwarded-For would otherwise let anyone claim a crawler's IP.
   */
  trustForwardedFor?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
  onClassified?: (req: any, res: any, classification: ClassificationResult) => boolean | void;
}

/**
 * Drop-in Express.js middleware for TrafficPulse.
 * Strictly non-blocking and fail-open.
 */
export function createTrafficPulseMiddleware(options: ExpressMiddlewareOptions) {
  const ignored = options.ignoredPaths || ['/favicon.ico', '/robots.txt', '/static'];

  return function trafficPulseMiddleware(req: any, res: any, next: () => void) {
    try {
      const path = String(req.path || req.url || '/').split(/[?#]/)[0];
      if (ignored.some((prefix) => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'))) {
        return next();
      }

      const ua = (req.headers && req.headers['user-agent']) || '';
      const xff = options.trustForwardedFor ? (req.headers && req.headers['x-forwarded-for']) : undefined;
      // Rightmost entry is the one appended by our own proxy; leftmost is client-controlled.
      const xffParts = typeof xff === 'string' ? xff.split(',').map((p: string) => p.trim()).filter(Boolean) : [];
      const ip = (xffParts.length ? xffParts[xffParts.length - 1] : '') || req.socket?.remoteAddress || '';

      let classification: ClassificationResult;
      try {
        classification = TrafficClassifier.classify({
          userAgent: ua,
          ip,
          method: req.method,
          path,
          headers: req.headers,
        });
      } catch {
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

      // Attach classification to req object
      req.trafficPulse = classification;

      if (res && typeof res.setHeader === 'function') {
        res.setHeader('X-TrafficPulse-Category', classification.category);
        res.setHeader('X-TrafficPulse-ActorType', classification.actorType);
        res.setHeader('X-TrafficPulse-Verification', classification.verificationStatus);
        if (classification.botIdentifier) {
          res.setHeader('X-TrafficPulse-Bot', classification.botIdentifier);
        }
      }

      // User hook (e.g., block scrapers)
      if (options.onClassified) {
        try {
          const handled = options.onClassified(req, res, classification);
          if (handled) return;
        } catch {
          // Fail-open: onClassified errors do not interrupt request flow
        }
      }

      // Asynchronously dispatch event (non-blocking)
      if (options.siteId && options.apiHost) {
        const idempotencyKey = `mw_exp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const payload = {
          siteId: options.siteId,
          idempotencyKey,
          path,
          method: req.method,
          userAgent: ua,
          referer: req.headers ? req.headers['referer'] : undefined,
          clientIp: ip || undefined,
          visitorHeaders: pickVisitorHeaders((n) => (req.headers ? (req.headers[n] as string | undefined) : undefined)),
          timestamp: new Date().toISOString(),
        };

        dispatchEventWithRetry({
          apiHost: options.apiHost,
          siteId: options.siteId,
          apiKey: options.apiKey,
          payload,
          timeoutMs: options.timeoutMs,
          maxRetries: options.maxRetries,
        }).catch(() => {});
      }

      next();
    } catch {
      // Fail-open guarantee: always call next
      next();
    }
  };
}
