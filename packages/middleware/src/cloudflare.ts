import { TrafficClassifier, ClassificationResult } from '@trafficpulse/classifier';

export interface CloudflareWorkerOptions {
  siteId: string;
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
      const payload = {
        siteId: options.siteId,
        path: url.pathname,
        method: request.method,
        trafficCategory: classification.category,
        botIdentifier: classification.botIdentifier,
        verifiedOrigin: classification.verifiedOrigin,
        requestHeaders: { userAgent: ua },
        timestamp: new Date().toISOString(),
      };

      const dispatchPromise = fetch(`${options.apiHost}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});

      ctx.waitUntil(dispatchPromise);
    }

    const response = await handler(request, env, ctx);
    const modifiedResponse = new Response(response.body, response);
    modifiedResponse.headers.set('X-TrafficPulse-Category', classification.category);
    if (classification.botIdentifier) {
      modifiedResponse.headers.set('X-TrafficPulse-Bot', classification.botIdentifier);
    }

    return modifiedResponse;
  };
}
