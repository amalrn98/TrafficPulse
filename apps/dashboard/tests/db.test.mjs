import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import createJiti from 'jiti';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${resolve(__dirname, '../prisma/dev.db')}`;
}
const jiti = createJiti(__dirname);
const { dbStore } = jiti(resolve(__dirname, '../src/lib/db.ts'));
const { prisma } = jiti(resolve(__dirname, '../src/lib/prisma.ts'));

let siteA;
let siteB;

before(async () => {
  // Setup clean test sites
  siteA = await dbStore.getOrCreateSite('tenant-a.com', 'Tenant A Production', false);
  siteB = await dbStore.getOrCreateSite('tenant-b.com', 'Tenant B Production', false);

  // Clean events for these test sites
  await prisma.event.deleteMany({
    where: { siteId: { in: [siteA.id, siteB.id] } },
  });
});

after(async () => {
  // Clean up
  await prisma.event.deleteMany({
    where: { siteId: { in: [siteA.id, siteB.id] } },
  });
  await prisma.site.deleteMany({
    where: { id: { in: [siteA.id, siteB.id] } },
  });
  await prisma.$disconnect();
});

test('Database Persistence - Registers sites with secure API keys and flags', async () => {
  assert.ok(siteA.id);
  assert.strictEqual(siteA.domain, 'tenant-a.com');
  assert.ok(siteA.apiKey.startsWith('tp_live_'));
  assert.strictEqual(siteA.isDemo, false);

  const fetched = await dbStore.getSiteById(siteA.id);
  assert.strictEqual(fetched?.domain, 'tenant-a.com');
  assert.strictEqual(fetched?.apiKey, siteA.apiKey);

  const byApiKey = await dbStore.getSiteByApiKey(siteA.apiKey);
  assert.strictEqual(byApiKey?.id, siteA.id);
});

test('Database Persistence - Records events persistently with epistemic fields', async () => {
  const result = await dbStore.recordEvent({
    siteId: siteA.id,
    idempotencyKey: 'idem_evt_001',
    timestamp: new Date().toISOString(),
    path: '/api/v1/resource',
    method: 'GET',
    actorType: 'ai_crawler',
    actorName: 'GPTBot',
    activityType: 'content_fetch',
    verificationStatus: 'verified',
    confidence: 0.95,
    evidence: JSON.stringify(['matched_rule:GPTBot', 'verified_cidr:20.15.240.0/20']),
    trafficCategory: 'llm_training',
    botIdentifier: 'GPTBot',
    actorFamily: 'OpenAI',
    intent: 'pre_training',
    verifiedOrigin: true,
    userAgent: 'GPTBot/1.2',
    ip: '20.15.240.10',
    statusCode: 200,
    durationMs: 32,
    isDemo: false,
  });

  assert.strictEqual(result.isDuplicate, false);
  assert.ok(result.event.id);
  assert.strictEqual(result.event.actorType, 'ai_crawler');
  assert.strictEqual(result.event.verificationStatus, 'verified');

  // Verify it exists in persistent database
  const fromDb = await prisma.event.findUnique({
    where: { id: result.event.id },
  });
  assert.ok(fromDb);
  assert.strictEqual(fromDb.siteId, siteA.id);
  assert.strictEqual(fromDb.trafficCategory, 'llm_training');
  assert.strictEqual(fromDb.verifiedOrigin, true);
});

test('Database Persistence - Idempotency detects duplicate submissions without inflating metrics', async () => {
  const duplicateSubmission = await dbStore.recordEvent({
    siteId: siteA.id,
    idempotencyKey: 'idem_evt_001', // Exact same idempotency key for siteA
    timestamp: new Date().toISOString(),
    path: '/api/v1/resource',
    method: 'GET',
    actorType: 'ai_crawler',
    actorName: 'GPTBot',
    activityType: 'content_fetch',
    verificationStatus: 'verified',
    confidence: 0.95,
    trafficCategory: 'llm_training',
    botIdentifier: 'GPTBot',
    actorFamily: 'OpenAI',
    intent: 'pre_training',
    verifiedOrigin: true,
    userAgent: 'GPTBot/1.2',
    statusCode: 200,
    isDemo: false,
  });

  assert.strictEqual(duplicateSubmission.isDuplicate, true);

  // Total count in DB must still be 1
  const count = await prisma.event.count({
    where: { siteId: siteA.id, idempotencyKey: 'idem_evt_001' },
  });
  assert.strictEqual(count, 1, 'Duplicate request must not create second row in database');
});

test('Tenant Isolation - Cross-tenant queries are strictly separated', async () => {
  // Record event for Tenant B
  await dbStore.recordEvent({
    siteId: siteB.id,
    idempotencyKey: 'idem_b_001',
    timestamp: new Date().toISOString(),
    path: '/tenant-b-only',
    method: 'POST',
    actorType: 'human_browser',
    actorName: 'Chrome',
    activityType: 'page_view',
    verificationStatus: 'claimed',
    confidence: 0.65,
    trafficCategory: 'human',
    actorFamily: 'VerifiedHuman',
    intent: 'user_browse',
    verifiedOrigin: false,
    userAgent: 'Mozilla/5.0 Chrome/128.0',
    statusCode: 200,
    isDemo: false,
  });

  // Query overview for Tenant A
  const overviewA = await dbStore.getOverview(siteA.id, false);
  // Query overview for Tenant B
  const overviewB = await dbStore.getOverview(siteB.id, false);

  assert.strictEqual(overviewA.categories.llm_training, 1);
  assert.strictEqual(overviewA.categories.human, 0); // Must NOT see Tenant B's human event

  assert.strictEqual(overviewB.categories.human, 1);
  assert.strictEqual(overviewB.categories.llm_training, 0); // Must NOT see Tenant A's bot event
});

test('Demo Data Isolation - Production queries never mix simulated demo data', async () => {
  // Record a demo event for site A
  await dbStore.recordEvent({
    siteId: siteA.id,
    idempotencyKey: 'idem_demo_test_01',
    timestamp: new Date().toISOString(),
    path: '/demo-path',
    method: 'GET',
    actorType: 'ai_agent',
    actorName: 'PerplexityBot',
    activityType: 'api_query',
    verificationStatus: 'verified',
    confidence: 0.95,
    trafficCategory: 'ai_agent',
    actorFamily: 'Perplexity',
    intent: 'rag_inference',
    verifiedOrigin: true,
    userAgent: 'PerplexityBot/1.0',
    statusCode: 200,
    isDemo: true, // Marked as DEMO!
  });

  // Production query (isDemo: false)
  const prodOverview = await dbStore.getOverview(siteA.id, false);
  assert.strictEqual(prodOverview.categories.ai_agent, 0, 'Production query must exclude demo events');

  // Demo query (isDemo: true)
  const demoOverview = await dbStore.getOverview(siteA.id, true);
  assert.strictEqual(demoOverview.categories.ai_agent, 1, 'Demo query must find demo event');
});

test('Time Bucketing - Unambiguous UTC timeseries buckets prevent cross-day hour folding', async () => {
  const timeseries = await dbStore.getTimeseries(siteA.id, false);
  assert.ok(Array.isArray(timeseries));
  assert.strictEqual(timeseries.length, 12);

  // Each bucket must contain full UTC timestamp
  for (const bucket of timeseries) {
    assert.ok(bucket.isoTimestamp, 'Must have ISO timestamp');
    assert.ok(bucket.isoTimestamp.endsWith('Z'), 'Timestamp must be UTC');
    assert.ok(bucket.time.includes('UTC'), 'Label must explicitly declare UTC');
  }
});
