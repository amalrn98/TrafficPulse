import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import createJiti from 'jiti';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(__dirname);
const { validateIngestPayload } = jiti(resolve(__dirname, '../src/lib/validation.ts'));

test('Validation - Accepts valid ingestion payload and normalizes fields', () => {
  const raw = {
    siteId: 'site_test_01',
    idempotencyKey: 'idemp_key_123',
    path: '/docs/api',
    method: 'GET',
    userAgent: 'Mozilla/5.0 Chrome/128.0',
    statusCode: 200,
    durationMs: 45,
    clientSignals: {
      webdriver: false,
      mouseEntropy: 1.6,
      interactionCount: 5,
    },
  };

  const res = validateIngestPayload(raw);
  assert.strictEqual(res.error, undefined);
  assert.ok(res.data);
  assert.strictEqual(res.data.siteId, 'site_test_01');
  assert.strictEqual(res.data.idempotencyKey, 'idemp_key_123');
  assert.strictEqual(res.data.path, '/docs/api');
  assert.strictEqual(res.data.method, 'GET');
  assert.strictEqual(res.data.statusCode, 200);
  assert.strictEqual(res.data.durationMs, 45);
  assert.strictEqual(res.data.clientSignals?.mouseEntropy, 1.6);
});

test('Validation - Strips client-supplied classification fields (Untrusted Input)', () => {
  const rawWithForgedFields = {
    siteId: 'site_test_01',
    path: '/',
    method: 'GET',
    userAgent: 'curl/8.4.0',
    // Client attempting to forge classification:
    trafficCategory: 'human',
    actorFamily: 'VerifiedHuman',
    intent: 'user_browse',
    verifiedOrigin: true,
    confidence: 0.99,
    botIdentifier: 'Organic-Browser',
  };

  const res = validateIngestPayload(rawWithForgedFields);
  assert.strictEqual(res.error, undefined);
  assert.ok(res.data);

  // Assert that none of the client classification fields exist in validated output
  const data = res.data;
  assert.strictEqual(data.trafficCategory, undefined);
  assert.strictEqual(data.actorFamily, undefined);
  assert.strictEqual(data.intent, undefined);
  assert.strictEqual(data.verifiedOrigin, undefined);
  assert.strictEqual(data.confidence, undefined);
  assert.strictEqual(data.botIdentifier, undefined);
});

test('Validation - Rejects missing or invalid siteId', () => {
  const missingSiteId = { path: '/' };
  const res1 = validateIngestPayload(missingSiteId);
  assert.ok(res1.error);
  assert.strictEqual(res1.error.field, 'siteId');

  const invalidChars = { siteId: 'site@#$%^&*()' };
  const res2 = validateIngestPayload(invalidChars);
  assert.ok(res2.error);
  assert.strictEqual(res2.error.field, 'siteId');
});

test('Validation - Rejects invalid HTTP methods and bounds', () => {
  const invalidMethod = {
    siteId: 'site_test_01',
    method: 'INVALID_VERB',
  };
  const res = validateIngestPayload(invalidMethod);
  assert.ok(res.error);
  assert.strictEqual(res.error.field, 'method');
});

test('Validation - Timestamp bounds checking prevents replay and clock skew abuse', () => {
  const futureTimestamp = {
    siteId: 'site_test_01',
    timestamp: new Date(Date.now() + 48 * 3600 * 1000).toISOString(), // 48h in future
  };
  const resFuture = validateIngestPayload(futureTimestamp);
  assert.ok(resFuture.error);
  assert.strictEqual(resFuture.error.field, 'timestamp');

  const pastTimestamp = {
    siteId: 'site_test_01',
    timestamp: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(), // 14 days past
  };
  const resPast = validateIngestPayload(pastTimestamp);
  assert.ok(resPast.error);
  assert.strictEqual(resPast.error.field, 'timestamp');
});

test('Validation - Data Minimization: Prohibits raw keystroke and form input collection', () => {
  const keyloggerAttempt = {
    siteId: 'site_test_01',
    clientSignals: {
      mouseEntropy: 1.2,
      keystrokes: 'secret_user_password_123',
    },
  };
  const res = validateIngestPayload(keyloggerAttempt);
  assert.ok(res.error);
  assert.strictEqual(res.error.field, 'clientSignals');
  assert.ok(res.error.message.includes('Privacy violation'));
});
