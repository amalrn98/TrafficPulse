import { test } from 'node:test';
import assert from 'node:assert';
import createJiti from 'jiti';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(root);
const { maskIpAddress, extractClientIp } = jiti(resolve(root, 'src/lib/ip-utils.ts'));
const { MemoryRateLimiter } = jiti(resolve(root, 'src/lib/rate-limit.ts'));
const { metricsRegistry } = jiti(resolve(root, 'src/lib/metrics.ts'));
const { verifyAdminAuth } = jiti(resolve(root, 'src/lib/auth.ts'));
const { validateIngestPayload } = jiti(resolve(root, 'src/lib/validation.ts'));

test('maskIpAddress truncates compressed IPv6 to /64', () => {
  assert.strictEqual(maskIpAddress('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::');
  assert.strictEqual(maskIpAddress('2001:db8::1'), '2001:db8:0:0::');
  assert.strictEqual(maskIpAddress('::ffff:66.249.66.1'), '66.249.66.0');
  assert.strictEqual(maskIpAddress('1.2.3.4'), '1.2.3.0');
  assert.strictEqual(maskIpAddress('not-an-ip'), 'masked');
});

test('extractClientIp ignores forwarding headers unless TRUST_PROXY=true', () => {
  const h = new Headers({ 'x-forwarded-for': '1.2.3.4' });
  delete process.env.TRUST_PROXY;
  assert.strictEqual(extractClientIp(h), '');
});

test('extractClientIp does not take the client-controlled leftmost XFF entry', () => {
  process.env.TRUST_PROXY = 'true';
  delete process.env.TRUSTED_PROXY_HOPS;
  const ip = extractClientIp(new Headers({ 'x-forwarded-for': '66.249.66.1, 203.0.113.9' }));
  delete process.env.TRUST_PROXY;
  assert.strictEqual(ip, '203.0.113.9');
});

test('MemoryRateLimiter cleanup removes idle drained buckets and is bounded', () => {
  const rl = new MemoryRateLimiter({ maxTokens: 5, refillRatePerSec: 1 });
  for (let i = 0; i < 5; i++) rl.check('k');
  const real = Date.now;
  Date.now = () => real() + 11 * 60 * 1000;
  rl.cleanup();
  Date.now = real;
  assert.strictEqual(rl.buckets.has('k'), false);
  const big = new MemoryRateLimiter();
  for (let i = 0; i < 120000; i++) big.check('x' + i);
  assert.ok(big.buckets.size <= 100000);
});

test('histogram buckets are cumulative exactly once', () => {
  metricsRegistry.recordDbLatencyMs(3);
  const lines = metricsRegistry.renderPrometheus().split('\n').filter((l) => l.startsWith('trafficpulse_db_duration_seconds_bucket'));
  const counts = lines.map((l) => Number(l.split(' ').pop()));
  assert.ok(Math.max(...counts) === counts[counts.length - 1], '+Inf must be the maximum bucket');
});

test('malformed cookie header cannot crash admin auth, and cookies are not accepted', () => {
  process.env.ADMIN_API_KEY = 'secret';
  process.env.NODE_ENV = 'production';
  const ok = verifyAdminAuth(new Request('http://x/', { headers: { authorization: 'Bearer secret', cookie: 'tp_admin_key=%E0%A4%A' } }));
  assert.strictEqual(ok.authorized, true);
  const viaCookie = verifyAdminAuth(new Request('http://x/', { headers: { cookie: 'tp_admin_key=secret' } }));
  assert.strictEqual(viaCookie.authorized, false);
});

test('validation strips query strings and fragments from path and referer', () => {
  const r = validateIngestPayload({ siteId: 's1', path: '/a/b?token=abc#x', referer: 'https://e.com/p?email=a@b.c' });
  assert.strictEqual(r.data.path, '/a/b');
  assert.strictEqual(r.data.referer, 'https://e.com/p');
});
