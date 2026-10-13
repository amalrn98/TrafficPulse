/**
 * Prometheus metrics registry for TrafficPulse.
 * Implements high-performance in-memory counters and latency histograms
 * exportable in standard Prometheus text format.
 */

interface LatencyHistogram {
  buckets: number[]; // Upper bounds in seconds
  bucketCounts: number[];
  count: number;
  sum: number;
}

const HISTOGRAM_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

function createHistogram(): LatencyHistogram {
  return {
    buckets: HISTOGRAM_BUCKETS,
    bucketCounts: new Array(HISTOGRAM_BUCKETS.length).fill(0),
    count: 0,
    sum: 0,
  };
}

function observeHistogram(histogram: LatencyHistogram, durationSec: number) {
  histogram.count += 1;
  histogram.sum += durationSec;
  for (let i = 0; i < histogram.buckets.length; i++) {
    if (durationSec <= histogram.buckets[i]) {
      histogram.bucketCounts[i] += 1;
    }
  }
}

class MetricsRegistry {
  private ingestRequests: Map<string, number> = new Map();
  private ingestRejections: Map<string, number> = new Map();
  private classificationLatency: LatencyHistogram = createHistogram();
  private dbLatency: LatencyHistogram = createHistogram();

  /**
   * Records an ingestion request.
   */
  public recordIngestRequest(status: 'success' | 'duplicate' | 'error', actorType: string = 'unknown') {
    const key = `status="${status}",actor_type="${actorType}"`;
    this.ingestRequests.set(key, (this.ingestRequests.get(key) || 0) + 1);
  }

  /**
   * Records an ingestion rejection with specific reason code.
   */
  public recordIngestRejection(reason: string) {
    const key = `reason="${reason}"`;
    this.ingestRejections.set(key, (this.ingestRejections.get(key) || 0) + 1);
  }

  /**
   * Records classification latency in milliseconds.
   */
  public recordClassificationLatencyMs(durationMs: number) {
    observeHistogram(this.classificationLatency, durationMs / 1000);
  }

  /**
   * Records database write latency in milliseconds.
   */
  public recordDbLatencyMs(durationMs: number) {
    observeHistogram(this.dbLatency, durationMs / 1000);
  }

  /**
   * Renders all collected metrics in Prometheus text format (version 0.0.4).
   */
  public renderPrometheus(): string {
    const lines: string[] = [];

    // 1. Ingest requests total
    lines.push('# HELP trafficpulse_ingest_requests_total Total number of event ingestion requests');
    lines.push('# TYPE trafficpulse_ingest_requests_total counter');
    if (this.ingestRequests.size === 0) {
      lines.push('trafficpulse_ingest_requests_total{status="success",actor_type="unknown"} 0');
    } else {
      for (const [labels, val] of this.ingestRequests.entries()) {
        lines.push(`trafficpulse_ingest_requests_total{${labels}} ${val}`);
      }
    }

    // 2. Ingest rejections total
    lines.push('# HELP trafficpulse_ingest_rejections_total Total number of rejected ingestion requests by reason');
    lines.push('# TYPE trafficpulse_ingest_rejections_total counter');
    if (this.ingestRejections.size === 0) {
      lines.push('trafficpulse_ingest_rejections_total{reason="none"} 0');
    } else {
      for (const [labels, val] of this.ingestRejections.entries()) {
        lines.push(`trafficpulse_ingest_rejections_total{${labels}} ${val}`);
      }
    }

    // 3. Classification latency histogram
    lines.push('# HELP trafficpulse_classification_duration_seconds Epistemic classification latency in seconds');
    lines.push('# TYPE trafficpulse_classification_duration_seconds histogram');
    let cumulative = 0;
    for (let i = 0; i < this.classificationLatency.buckets.length; i++) {
      cumulative += this.classificationLatency.bucketCounts[i];
      lines.push(`trafficpulse_classification_duration_seconds_bucket{le="${this.classificationLatency.buckets[i]}"} ${cumulative}`);
    }
    lines.push(`trafficpulse_classification_duration_seconds_bucket{le="+Inf"} ${this.classificationLatency.count}`);
    lines.push(`trafficpulse_classification_duration_seconds_sum ${this.classificationLatency.sum.toFixed(6)}`);
    lines.push(`trafficpulse_classification_duration_seconds_count ${this.classificationLatency.count}`);

    // 4. DB latency histogram
    lines.push('# HELP trafficpulse_db_duration_seconds Database persistence latency in seconds');
    lines.push('# TYPE trafficpulse_db_duration_seconds histogram');
    let dbCumulative = 0;
    for (let i = 0; i < this.dbLatency.buckets.length; i++) {
      dbCumulative += this.dbLatency.bucketCounts[i];
      lines.push(`trafficpulse_db_duration_seconds_bucket{le="${this.dbLatency.buckets[i]}"} ${dbCumulative}`);
    }
    lines.push(`trafficpulse_db_duration_seconds_bucket{le="+Inf"} ${this.dbLatency.count}`);
    lines.push(`trafficpulse_db_duration_seconds_sum ${this.dbLatency.sum.toFixed(6)}`);
    lines.push(`trafficpulse_db_duration_seconds_count ${this.dbLatency.count}`);

    return lines.join('\n') + '\n';
  }
}

// Global singleton for the process
export const metricsRegistry = new MetricsRegistry();

