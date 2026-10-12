import { TrafficClassifier, ClassificationResult } from '@trafficpulse/classifier';

export interface CloudflareWorkerOptions {
  siteId: string;
  apiKey?: string;
  apiHost?: string;
  onClassified?: (request: Request, classification: ClassificationResult) => Promise<Response | null>;
}

/**
 * Drop-in wrapper for Cloudflare Worker fetch handlers.
 */
export function trafficPulseWorker(
  handler: (request: Request, env: any, ctx: any) => Promise<Response>,
  options: CloudflareWorkerOptions
) {
  return async function (request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';
    const ip = request.headers.get('cf-connecting-ip') || '';

    const classification = TrafficClassifier.classify({
      userAgent: ua,
      ip,
      method: request.method,
      path: url.pathname,
    });

    if (options.onClassified) {
      const intercepted = await options.onClassified(request, classification);
      if (intercepted) return intercepted;
    }

    // Use ctx.waitUntil to dispatch analytics without adding latency to the response
    if (options.siteId && options.apiHost && ctx && ctx.waitUntil) {
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

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      };
      if (options.apiKey) {
        headers['Authorization'] = `Bearer ${options.apiKey}`;
      }

      const dispatchPromise = fetch(`${options.apiHost.replace(/\/$/, '')}/api/v1/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }).catch(() => {});

      ctx.waitUntil(dispatchPromise);
    }

    const response = await handler(request, env, ctx);
    const modifiedResponse = new Response(response.body, response);
    modifiedResponse.headers.set('X-TrafficPulse-Category', classification.category);
    modifiedResponse.headers.set('X-TrafficPulse-ActorType', classification.actorType);
    modifiedResponse.headers.set('X-TrafficPulse-Verification', classification.verificationStatus);
    if (classification.botIdentifier) {
      modifiedResponse.headers.set('X-TrafficPulse-Bot', classification.botIdentifier);
    }

    return modifiedResponse;
  };
}
