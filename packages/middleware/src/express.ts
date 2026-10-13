import { TrafficClassifier, ClassificationResult } from '@trafficpulse/classifier';
import { dispatchEventWithRetry } from './dispatch';

export interface ExpressMiddlewareOptions {
  siteId: string;
  apiKey?: string;
  apiHost?: string;
  ignoredPaths?: string[];
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
      const path = req.path || req.url || '/';
      if (ignored.some((prefix) => path.startsWith(prefix))) {
        return next();
      }

      const ua = (req.headers && req.headers['user-agent']) || '';
      const ip =
        (req.headers && req.headers['x-forwarded-for'])?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        '';

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
