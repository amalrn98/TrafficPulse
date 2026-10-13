export interface DispatchOptions {
  apiHost: string;
  siteId: string;
  apiKey?: string;
  payload: Record<string, any>;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Dispatches an event payload to TrafficPulse with bounded retries and timeout.
 * Strictly non-blocking and fail-open: never rejects or throws an unhandled error.
 */
export async function dispatchEventWithRetry(options: DispatchOptions): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 3000;
  const maxRetries = options.maxRetries ?? 2;
  const ingestUrl = `${options.apiHost.replace(/\/$/, '')}/api/v1/events`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Idempotency-Key': String(options.payload.idempotencyKey || ''),
  };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }

  const body = JSON.stringify(options.payload);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(ingestUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Return on success or 4xx client rejection (do not retry client errors)
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return;
      }
    } catch {
      clearTimeout(timer);
    }

    if (attempt < maxRetries) {
      const delayMs = Math.min(50 * Math.pow(2, attempt), 300);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

