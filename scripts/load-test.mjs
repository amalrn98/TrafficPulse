#!/usr/bin/env node
/**
 * Ingestion Endpoint Load Testing Script
 *
 * Simulates high-throughput concurrent traffic against TrafficPulse ingestion API.
 * Computes throughput (req/s), latency percentiles (p50, p90, p95, p99),
 * and status code distribution.
 *
 * Usage:
 *   node scripts/load-test.mjs [--url http://localhost:3000] [--concurrency 20] [--duration 10] [--siteId demo]
 */

import { performance } from 'perf_hooks';

const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}

const TARGET_URL = getArg('url', 'http://127.0.0.1:3000/api/v1/events');
const CONCURRENCY = parseInt(getArg('concurrency', '20'), 10);
const DURATION_SEC = parseInt(getArg('duration', '5'), 10);
const SITE_ID = getArg('siteId', 'site_demo');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'curl/8.4.0',
];

const PATHS = [
  '/blog/agentic-web',
  '/products/analytics',
  '/api/v1/search',
  '/documentation/quickstart',
  '/pricing',
];

function generatePayload(workerId, index) {
  const ua = USER_AGENTS[index % USER_AGENTS.length];
  const path = PATHS[index % PATHS.length];
  const idempotencyKey = `load_${workerId}_${index}_${Date.now()}`;

  return {
    siteId: SITE_ID,
    idempotencyKey,
    path,
    method: 'GET',
    userAgent: ua,
    timestamp: new Date().toISOString(),
  };
}

async function runWorker(workerId, deadline, latencies, statusCodes) {
  let index = 0;
  while (performance.now() < deadline) {
    const payload = generatePayload(workerId, index++);
    const start = performance.now();
    try {
      const res = await fetch(TARGET_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': `192.168.1.${(workerId * 10 + index) % 250 + 1}`,
        },
        body: JSON.stringify(payload),
      });
      const duration = performance.now() - start;
      latencies.push(duration);
      statusCodes[res.status] = (statusCodes[res.status] || 0) + 1;
    } catch (err) {
      const duration = performance.now() - start;
      latencies.push(duration);
      statusCodes['ERROR'] = (statusCodes['ERROR'] || 0) + 1;
    }
  }
}

function calculatePercentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`   TrafficPulse Ingestion Endpoint Load Test`);
  console.log(`======================================================`);
  console.log(`Target:      ${TARGET_URL}`);
  console.log(`Site ID:     ${SITE_ID}`);
  console.log(`Concurrency: ${CONCURRENCY} parallel workers`);
  console.log(`Duration:    ${DURATION_SEC} seconds\n`);

  const latencies = [];
  const statusCodes = {};
  const testStart = performance.now();
  const deadline = testStart + DURATION_SEC * 1000;

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(runWorker(i, deadline, latencies, statusCodes));
  }

  await Promise.all(workers);
  const totalDurationSec = (performance.now() - testStart) / 1000;

  latencies.sort((a, b) => a - b);
  const totalRequests = latencies.length;
  const rps = (totalRequests / totalDurationSec).toFixed(1);

  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const avg = totalRequests > 0 ? (sum / totalRequests).toFixed(2) : 0;
  const p50 = calculatePercentile(latencies, 50).toFixed(2);
  const p90 = calculatePercentile(latencies, 90).toFixed(2);
  const p95 = calculatePercentile(latencies, 95).toFixed(2);
  const p99 = calculatePercentile(latencies, 99).toFixed(2);
  const min = latencies[0]?.toFixed(2) || 0;
  const max = latencies[latencies.length - 1]?.toFixed(2) || 0;

  console.log(`--- Results ---`);
  console.log(`Completed Requests: ${totalRequests}`);
  console.log(`Elapsed Time:       ${totalDurationSec.toFixed(2)}s`);
  console.log(`Throughput:         ${rps} req/sec`);
  console.log(`\n--- Latencies (ms) ---`);
  console.log(`Min: ${min} ms | Avg: ${avg} ms | Max: ${max} ms`);
  console.log(`p50: ${p50} ms | p90: ${p90} ms | p95: ${p95} ms | p99: ${p99} ms`);
  console.log(`\n--- Status Distribution ---`);
  for (const [code, count] of Object.entries(statusCodes)) {
    console.log(`HTTP ${code}: ${count} (${((count / totalRequests) * 100).toFixed(1)}%)`);
  }
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error('Load test aborted:', err);
  process.exit(1);
});

