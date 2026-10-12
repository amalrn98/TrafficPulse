import { test } from 'node:test';
import assert from 'node:assert';
import { withTrafficPulse } from '../src/nextjs';
import { createTrafficPulseMiddleware } from '../src/express';
import { trafficPulseWorker } from '../src/cloudflare';

test('Next.js Middleware - Classifies requests and triggers hook', async () => {
  let classifiedResult: any = null;

  const mw = withTrafficPulse({
    siteId: 'site_next_01',
    apiKey: 'tp_live_testkey',
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
