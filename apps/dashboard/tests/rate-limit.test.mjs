import { test } from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import createJiti from 'jiti';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(__dirname);
const { MemoryRateLimiter, RedisRateLimiter } = jiti(resolve(__dirname, '../src/lib/rate-limit.ts'));

test('RateLimiter - Allows requests within token burst capacity', () => {
  const limiter = new MemoryRateLimiter({ maxTokens: 5, refillRatePerSec: 1 });

  for (let i = 0; i < 5; i++) {
    const res = limiter.check('test_client_1');
    assert.strictEqual(res.allowed, true);
  }
});

test('RateLimiter - Rejects requests once burst limit is exceeded', () => {
  const limiter = new MemoryRateLimiter({ maxTokens: 3, refillRatePerSec: 1 });

  assert.strictEqual(limiter.check('client_burst').allowed, true);
  assert.strictEqual(limiter.check('client_burst').allowed, true);
  assert.strictEqual(limiter.check('client_burst').allowed, true);

  // 4th request must be rejected
  const rejected = limiter.check('client_burst');
  assert.strictEqual(rejected.allowed, false);
  assert.strictEqual(rejected.remaining, 0);
  assert.ok(rejected.retryAfterSec && rejected.retryAfterSec >= 1);
});

test('RateLimiter - Isolates rate limits across distinct keys', () => {
  const limiter = new MemoryRateLimiter({ maxTokens: 2, refillRatePerSec: 1 });

  limiter.check('tenant_A');
  limiter.check('tenant_A');
  assert.strictEqual(limiter.check('tenant_A').allowed, false);

  // Tenant B must not be throttled by Tenant A's volume
  assert.strictEqual(limiter.check('tenant_B').allowed, true);
});

test('RedisRateLimiter - Executes RESP EVAL against Redis TCP server and enforces limits', async () => {
  const counts = new Map();
  const maxTokens = 2;

  const server = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      if (str.includes('EVAL')) {
        const match = str.match(/tp:rl:[^\r\n]+/);
        const key = match ? match[0] : 'default';
        const used = (counts.get(key) || 0) + 1;
        counts.set(key, used);

        if (used <= maxTokens) {
          const rem = maxTokens - used;
          socket.write(`*3\r\n:1\r\n:${rem}\r\n:0\r\n`);
        } else {
          socket.write(`*3\r\n:0\r\n:0\r\n:2\r\n`);
        }
      }
    });
  });

  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 6379;

  try {
    const redisLimiter = new RedisRateLimiter(`redis://127.0.0.1:${port}`, {
      maxTokens: 2,
      refillRatePerSec: 1,
      timeoutMs: 200,
    });

    const r1 = await redisLimiter.check('site_redis_1');
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.remaining, 1);

    const r2 = await redisLimiter.check('site_redis_1');
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r2.remaining, 0);

    const r3 = await redisLimiter.check('site_redis_1');
    assert.strictEqual(r3.allowed, false);
    assert.strictEqual(r3.retryAfterSec, 2);
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
});

test('RedisRateLimiter - Falls back gracefully to in-memory limiter when Redis is offline', async () => {
  const offlineLimiter = new RedisRateLimiter('redis://127.0.0.1:59998', {
    maxTokens: 2,
    refillRatePerSec: 1,
    timeoutMs: 50,
  });

  const r1 = await offlineLimiter.check('fallback_client');
  assert.strictEqual(r1.allowed, true);
  const r2 = await offlineLimiter.check('fallback_client');
  assert.strictEqual(r2.allowed, true);
  const r3 = await offlineLimiter.check('fallback_client');
  assert.strictEqual(r3.allowed, false);
});
