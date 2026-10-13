import { TrafficClassifier, ClassificationResult } from '@trafficpulse/classifier';
import { dispatchEventWithRetry } from './dispatch';

export interface CloudflareWorkerOptions {
  siteId: string;
  apiKey?: string;
  apiHost?: string;
  timeoutMs?: number;
  maxRetries?: number;
  onClassified?: (request: Request, classification: ClassificationResult) => Promise<Response | null>;
}

/**
 * Drop-in wrapper for Cloudflare Worker fetch handlers.
 * Strictly non-blocking and fail-open.
 */
export function trafficPulseWorker(
  handler: (request: Request, env: any, ctx: any) => Promise<Response>,
  options: CloudflareWorkerOptions
) {
  return async function (request: Request, env: any, ctx: any): Promise<Response> {
    let classification: ClassificationResult;
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';
    const ip = request.headers.get('cf-connecting-ip') || '';

    try {
      classification = TrafficClassifier.classify({
        userAgent: ua,
        ip,
        method: request.method,
        path: url.pathname,
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

    if (options.onClassified) {
      try {
        const intercepted = await options.onClassified(request, classification);
        if (intercepted) return intercepted;
      } catch {
        // Fail-open: onClassified failure allows request through
      }
    }

    // Use ctx.waitUntil to dispatch analytics without adding latency to the response
    if (options.siteId && options.apiHost && ctx && typeof ctx.waitUntil === 'function') {
      const idempotencyKey = `mw_cf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const payload = {
        siteId: options.siteId,
        idempotencyKey,
        path: url.pathname,
        method: request.method,
        userAgent: ua,
        referer: request.headers.get('referer') || undefined,
        timestamp: new Date().toISOString(),
      };

      const dispatchPromise = dispatchEventWithRetry({
        apiHost: options.apiHost,
        siteId: options.siteId,
        apiKey: options.apiKey,
        payload,
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries,
      }).catch(() => {});

      ctx.waitUntil(dispatchPromise);
    }

    const response = await handler(request, env, ctx);
    try {
      const modifiedResponse = new Response(response.body, response);
      modifiedResponse.headers.set('X-TrafficPulse-Category', classification.category);
      modifiedResponse.headers.set('X-TrafficPulse-ActorType', classification.actorType);
      modifiedResponse.headers.set('X-TrafficPulse-Verification', classification.verificationStatus);
      if (classification.botIdentifier) {
        modifiedResponse.headers.set('X-TrafficPulse-Bot', classification.botIdentifier);
      }
      return modifiedResponse;
    } catch {
      // Return original response if modifying fails
      return response;
    }
  };
}
