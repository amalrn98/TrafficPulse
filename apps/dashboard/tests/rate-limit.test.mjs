import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import createJiti from 'jiti';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(__dirname);
const { MemoryRateLimiter } = jiti(resolve(__dirname, '../src/lib/rate-limit.ts'));

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
