import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import createJiti from 'jiti';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(__dirname);

const { metricsRegistry } = jiti(resolve(__dirname, '../src/lib/metrics.ts'));
const { verifyMetricsAuth } = jiti(resolve(__dirname, '../src/lib/auth.ts'));

test('Metrics - Ingestion requests, rejections, and latencies are recorded and formatted for Prometheus', () => {
  metricsRegistry.recordIngestRequest('success', 'ai_crawler');
  metricsRegistry.recordIngestRequest('duplicate', 'human_browser');
  metricsRegistry.recordIngestRejection('rate_limit_exceeded');
  metricsRegistry.recordClassificationLatencyMs(1.5);
  metricsRegistry.recordDbLatencyMs(8.2);

  const output = metricsRegistry.renderPrometheus();

  assert.ok(output.includes('# HELP trafficpulse_ingest_requests_total'), 'Must declare ingest_requests_total help');
  assert.ok(output.includes('# TYPE trafficpulse_ingest_requests_total counter'), 'Must declare counter type');
  assert.ok(output.includes('trafficpulse_ingest_requests_total{status="success",actor_type="ai_crawler"} 1'));
  assert.ok(output.includes('trafficpulse_ingest_requests_total{status="duplicate",actor_type="human_browser"} 1'));
  assert.ok(output.includes('trafficpulse_ingest_rejections_total{reason="rate_limit_exceeded"} 1'));
  assert.ok(output.includes('trafficpulse_classification_duration_seconds_bucket'), 'Must export classification latency histogram');
  assert.ok(output.includes('trafficpulse_db_duration_seconds_bucket'), 'Must export db latency histogram');
});

test('Metrics Auth - Verifies metrics endpoint access control', () => {
  const origEnv = process.env.NODE_ENV;
  const origToken = process.env.METRICS_AUTH_TOKEN;

  try {
    process.env.NODE_ENV = 'production';
    process.env.METRICS_AUTH_TOKEN = 'secret_metrics_token_999';

    // Unauthenticated request in production
    const unauthReq = new Request('https://test/api/metrics');
    const unauthRes = verifyMetricsAuth(unauthReq);
    assert.strictEqual(unauthRes.authorized, false);

    // Request with valid Bearer token
    const authReq = new Request('https://test/api/metrics', {
      headers: { authorization: 'Bearer secret_metrics_token_999' },
    });
    const authRes = verifyMetricsAuth(authReq);
    assert.strictEqual(authRes.authorized, true);

    // Request with invalid token
    const badReq = new Request('https://test/api/metrics', {
      headers: { authorization: 'Bearer wrong_token' },
    });
    const badRes = verifyMetricsAuth(badReq);
    assert.strictEqual(badRes.authorized, false);
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.METRICS_AUTH_TOKEN = origToken;
  }
});

