import { performance } from 'perf_hooks';
import { TrafficClassifier } from '../packages/classifier/dist/src/index.js';

import createJiti from 'jiti';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(__dirname);
const { validateIngestPayload } = jiti(resolve(__dirname, '../apps/dashboard/src/lib/validation.ts'));
const { dbStore: directDbStore } = jiti(resolve(__dirname, '../apps/dashboard/src/lib/db.ts'));

async function main() {
  console.log('--- Benchmarking Epistemic Classifier Raw Throughput ---');
  const samples = [
    { userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)', ip: '20.15.240.10' },
    { userAgent: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', ip: '160.79.104.10' },
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36', ip: '192.168.1.1' },
    { userAgent: 'curl/8.4.0', ip: '10.0.0.1' },
    { userAgent: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', ip: '198.181.160.1' },
  ];

  const WARMUP = 1000;
  for (let i = 0; i < WARMUP; i++) {
    TrafficClassifier.classify(samples[i % samples.length]);
  }

  const N = 50000;
  const startClass = performance.now();
  for (let i = 0; i < N; i++) {
    TrafficClassifier.classify(samples[i % samples.length]);
  }
  const durClass = performance.now() - startClass;
  const classOpsPerSec = ((N / durClass) * 1000).toFixed(0);
  const classAvgMs = ((durClass / N) * 1000).toFixed(2); // microseconds
  console.log(`Classified ${N} payloads in ${durClass.toFixed(2)}ms`);
  console.log(`Throughput: ${classOpsPerSec} classifications/sec (avg ${classAvgMs} µs/op)\n`);

  console.log('--- Benchmarking Ingestion Pipeline (Validation + Classification + DB Store) ---');
  const benchSite = await directDbStore.getOrCreateSite('benchmark.test', 'Benchmark Site', true);
  const DBN = 1000;
  const dbLatencies = [];
  const pipelineStart = performance.now();

  for (let i = 0; i < DBN; i++) {
    const s = samples[i % samples.length];
    const opStart = performance.now();
    const rawPayload = {
      siteId: benchSite.id,
      idempotencyKey: `bench_${i}_${Date.now()}`,
      path: '/blog/post',
      method: 'GET',
      userAgent: s.userAgent,
      timestamp: new Date().toISOString(),
    };
    const valid = validateIngestPayload(rawPayload, s.userAgent);
    const classification = TrafficClassifier.classify({
      userAgent: valid.data.userAgent,
      ip: s.ip,
      method: 'GET',
      path: '/blog/post',
    });
    await directDbStore.recordEvent({
      siteId: benchSite.id,
      idempotencyKey: rawPayload.idempotencyKey,
      timestamp: rawPayload.timestamp,
      path: rawPayload.path,
      method: rawPayload.method,
      actorType: classification.actorType,
      actorName: classification.actorName,
      activityType: classification.activityType,
      verificationStatus: classification.verificationStatus,
      confidence: classification.confidence,
      evidence: JSON.stringify(classification.reasonCodes),
      trafficCategory: classification.category,
      botIdentifier: classification.botIdentifier,
      actorFamily: classification.actorFamily,
      intent: classification.intent,
      verifiedOrigin: classification.verifiedOrigin,
      userAgent: rawPayload.userAgent,
      ip: s.ip,
      isDemo: true,
    });
    dbLatencies.push(performance.now() - opStart);
  }

  const totalDbTime = performance.now() - pipelineStart;
  dbLatencies.sort((a, b) => a - b);
  const p50 = dbLatencies[Math.floor(DBN * 0.5)].toFixed(2);
  const p95 = dbLatencies[Math.floor(DBN * 0.95)].toFixed(2);
  const p99 = dbLatencies[Math.floor(DBN * 0.99)].toFixed(2);
  const avg = (totalDbTime / DBN).toFixed(2);
  const pipelineRps = ((DBN / totalDbTime) * 1000).toFixed(1);

  console.log(`Executed ${DBN} full pipeline writes in ${totalDbTime.toFixed(2)}ms`);
  console.log(`Pipeline Throughput: ${pipelineRps} events/sec`);
  console.log(`Latencies: Avg ${avg}ms | p50 ${p50}ms | p95 ${p95}ms | p99 ${p99}ms`);
}

main().catch(console.error);
