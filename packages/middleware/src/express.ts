import { TrafficClassifier, ClassificationResult } from '@trafficpulse/classifier';

export interface ExpressMiddlewareOptions {
  siteId: string;
  apiKey?: string;
  apiHost?: string;
  ignoredPaths?: string[];
  onClassified?: (req: any, res: any, classification: ClassificationResult) => boolean | void;
}

/**
 * Drop-in Express.js middleware for TrafficPulse.
 */
export function createTrafficPulseMiddleware(options: ExpressMiddlewareOptions) {
  const ignored = options.ignoredPaths || ['/favicon.ico', '/robots.txt', '/static'];

  return function trafficPulseMiddleware(req: any, res: any, next: () => void) {
    const path = req.path || req.url || '/';
    if (ignored.some((prefix) => path.startsWith(prefix))) {
      return next();
    }

    const ua = (req.headers['user-agent'] as string) || '';
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      '';

    const classification = TrafficClassifier.classify({
      userAgent: ua,
      ip,
      method: req.method,
      path,
      headers: req.headers,
    });

    // Attach classification to req object
    req.trafficPulse = classification;

    res.setHeader('X-TrafficPulse-Category', classification.category);
    res.setHeader('X-TrafficPulse-ActorType', classification.actorType);
    res.setHeader('X-TrafficPulse-Verification', classification.verificationStatus);
    if (classification.botIdentifier) {
      res.setHeader('X-TrafficPulse-Bot', classification.botIdentifier);
    }

    // User hook (e.g., block scrapers)
    if (options.onClassified) {
      const handled = options.onClassified(req, res, classification);
      if (handled) return;
    }

    // Asynchronously dispatch event
    if (options.siteId && options.apiHost) {
      const idempotencyKey = `mw_exp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const payload = {
        siteId: options.siteId,
        idempotencyKey,
        path,
        method: req.method,
        userAgent: ua,
        referer: req.headers['referer'],
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
      }).catch(() => {});
    }

    next();
  };
}
