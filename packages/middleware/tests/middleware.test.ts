import { test } from 'node:test';
import assert from 'node:assert';
import { withTrafficPulse } from '../src/nextjs';
import { createTrafficPulseMiddleware } from '../src/express';
import { trafficPulseWorker } from '../src/cloudflare';
import { dispatchEventWithRetry } from '../src/dispatch';

test('Next.js Middleware - Classifies requests, triggers hook, and registers waitUntil', async () => {
  let classifiedResult: any = null;
  let waitUntilRegistered = false;

  const mw = withTrafficPulse({
    siteId: 'site_next_01',
    apiKey: 'tp_live_testkey',
    apiHost: 'http://127.0.0.1:59999',
    timeoutMs: 50,
    maxRetries: 0,
    onClassified: (_req, classification) => {
      classifiedResult = classification;
      if (classification.category === 'generic_bot') {
        return new Response('Blocked', { status: 403 });
      }
    },
  });

  // 1. Bypass static route
  const staticReq = new Request('https://example.com/_next/static/chunk.js');
  const staticRes = await mw(staticReq);
  assert.strictEqual(staticRes, undefined);
  assert.ok(!classifiedResult);

  // 2. Classify bot request
  const botReq = new Request('https://example.com/api/data', {
    headers: { 'user-agent': 'curl/8.4.0' },
  });
  const botRes = await mw(botReq);
  assert.ok(botRes);
  assert.strictEqual(botRes.status, 403);
  const result: any = classifiedResult;
  assert.ok(result);
  assert.strictEqual(result.category, 'generic_bot');
  assert.strictEqual(result.actorType, 'automation_tool');

  // 3. Verify event.waitUntil is invoked for non-blocked requests on Edge runtime
  const allowedReq = new Request('https://example.com/home', {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  await mw(allowedReq, {
    waitUntil: (p: Promise<unknown>) => {
      waitUntilRegistered = p instanceof Promise;
    },
  });
  assert.strictEqual(waitUntilRegistered, true, 'Next.js middleware must register dispatch promise with event.waitUntil');
});

test('Express Middleware - Attaches classification to request and sets response headers', () => {
  const mw = createTrafficPulseMiddleware({
    siteId: 'site_exp_01',
    apiKey: 'tp_live_expkey',
  });

  const req: any = {
    method: 'GET',
    url: '/blog/agentic-web',
    headers: {
      'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      'x-forwarded-for': '20.15.240.10',
    },
  };

  const headersSet: Record<string, string> = {};
  const res: any = {
    setHeader: (name: string, val: string) => {
      headersSet[name] = val;
    },
  };

  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.ok(req.trafficPulse);
  assert.strictEqual(req.trafficPulse.actorType, 'ai_crawler');
  assert.strictEqual(req.trafficPulse.category, 'llm_training');
  assert.strictEqual(headersSet['X-TrafficPulse-Category'], 'llm_training');
  assert.strictEqual(headersSet['X-TrafficPulse-ActorType'], 'ai_crawler');
  assert.strictEqual(headersSet['X-TrafficPulse-Verification'], 'verified');
  assert.strictEqual(headersSet['X-TrafficPulse-Bot'], 'GPTBot');
});

test('Cloudflare Worker Wrapper - Executes fetch handler with headers and classification', async () => {
  const handler = async (request: Request) => {
    return new Response('Hello Edge', { status: 200 });
  };

  const worker = trafficPulseWorker(handler, {
    siteId: 'site_cf_01',
    apiKey: 'tp_live_cfkey',
  });

  const req = new Request('https://cf-worker.test/docs', {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
      'cf-connecting-ip': '198.181.160.5',
    },
  });

  const res = await worker(req, {}, { waitUntil: () => {} });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('X-TrafficPulse-Category'), 'ai_agent');
  assert.strictEqual(res.headers.get('X-TrafficPulse-ActorType'), 'ai_agent');
  assert.strictEqual(res.headers.get('X-TrafficPulse-Verification'), 'verified');
  assert.strictEqual(res.headers.get('X-TrafficPulse-Bot'), 'PerplexityBot');
});

test('Resilience - Next.js Middleware fails open when ingestion backend is offline', async () => {
  const mw = withTrafficPulse({
    siteId: 'site_offline_01',
    apiHost: 'http://127.0.0.1:59999', // Non-existent offline port
    timeoutMs: 100,
    maxRetries: 1,
  });

  const req = new Request('https://example.com/checkout');
  // Must execute without throwing and return undefined to allow Next.js routing to proceed
  const res = await mw(req);
  assert.strictEqual(res, undefined);
});

test('Resilience - Next.js Middleware fails open when onClassified hook throws', async () => {
  const mw = withTrafficPulse({
    siteId: 'site_throw_01',
    onClassified: () => {
      throw new Error('Unexpected crash in user hook');
    },
  });

  const req = new Request('https://example.com/products');
  const res = await mw(req);
  // Must not throw or return a 500 Response: request is allowed through
  assert.strictEqual(res, undefined);
});

test('Resilience - Express Middleware fails open when backend is offline or hook throws', () => {
  const mw = createTrafficPulseMiddleware({
    siteId: 'site_exp_fail',
    apiHost: 'http://127.0.0.1:59999',
    timeoutMs: 100,
    maxRetries: 1,
    onClassified: () => {
      throw new Error('Hook failure');
    },
  });

  const req: any = {
    method: 'GET',
    url: '/home',
    headers: {},
  };
  const res: any = {
    setHeader: () => {},
  };

  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true, 'next() must be called even on failure');
});

test('Resilience - Dispatch utility terminates cleanly on network connection refusal', async () => {
  let completed = false;
  await dispatchEventWithRetry({
    apiHost: 'http://127.0.0.1:59999',
    siteId: 'test_site',
    payload: { idempotencyKey: 'mw_test_retry' },
    timeoutMs: 50,
    maxRetries: 1,
  });
  completed = true;
  assert.strictEqual(completed, true, 'Dispatch utility must resolve without throwing');
});
