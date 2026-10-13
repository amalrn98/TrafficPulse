# TrafficPulse Performance and Benchmarks

This document records empirical performance metrics, microbenchmarks, and load testing procedures for TrafficPulse.

## Test Environment and Hardware Specifications

All benchmark numbers documented below were gathered on the following environment:

| Specification | Value |
|---|---|
| **CPU** | Intel(R) Core(TM) i5-10210U CPU @ 1.60GHz (4 physical cores, 8 logical processors) |
| **Memory** | 16 GB RAM (15.77 GB visible) |
| **Operating System** | Windows 11 Pro 64-bit |
| **Node.js Version** | v20.18.0 (V8 11.3.244.8) |
| **Database Engine** | SQLite (WAL mode, dev) / PostgreSQL 16 (production) |

## Classifier Microbenchmark

The core classifier (`@trafficpulse/classifier`) runs synchronously in memory without blocking I/O:

```
Benchmark Command: node scripts/benchmark-pipeline.mjs
Samples: 50,000 realistic heterogeneous payloads (crawlers, browsers, tools, spoofed signatures)
Elapsed Time: 200.05 ms
Throughput: ~250,000 classifications / sec
Average Latency: ~4.0 µs / operation
```

### Key Classifier Observations

- Zero external network dependencies during classification.
- In-memory CIDR lookup matches 64+ subnets via bitwise integer math in sub-microsecond time.
- Deterministic heuristic execution ensures negligible jitter.

## End-to-End Ingestion Pipeline Benchmark

The end-to-end ingestion pipeline includes:
1. Payload schema validation and sanitization (`validateIngestPayload`).
2. Client IP extraction and header parsing.
3. Server-side classification (`TrafficClassifier.classify`).
4. Privacy IP masking (IPv4 /24, IPv6 /64).
5. Database write operation with idempotency deduplication (`dbStore.recordEvent`).

```
Workload: 1,000 persistent event writes
Elapsed Time: 5,547.60 ms
Throughput: 180.3 events / sec (single-instance SQLite local dev)
Latencies:
  - Average: 5.55 ms
  - p50: 5.30 ms
  - p95: 6.88 ms
  - p99: 8.34 ms
```

> [!NOTE]
> SQLite is constrained by file-lock concurrency. In production deployments using PostgreSQL 16 with a connection pool (`connection_limit=20`) and read replicas, ingestion throughput scales horizontally across multiple dashboard instances.

## Ingestion Load Testing Script

TrafficPulse provides a load testing harness at `scripts/load-test.mjs` to benchmark running instances:

```bash
# Run against a local development server
node scripts/load-test.mjs --url http://127.0.0.1:3000/api/v1/events --concurrency 20 --duration 10 --siteId site_demo

# Run against a production staging instance
node scripts/load-test.mjs --url https://analytics.company.com/api/v1/events --concurrency 50 --duration 30 --siteId site_live
```

The tool reports:
- Total completed requests and elapsed time.
- Throughput (requests / sec).
- Latency percentiles (min, avg, p50, p90, p95, p99, max).
- Status code distribution (201 Created, 200 Deduplicated, 429 Rate limited, 4xx/5xx).

## Middleware Performance Impact

The edge middleware adapters (`packages/middleware`) are designed for near-zero added latency:
1. Next.js and Cloudflare Worker middleware evaluate classification locally in under 0.05 ms.
2. Ingestion telemetry is dispatched asynchronously using fire-and-forget background promises (`ctx.waitUntil` on Cloudflare or un-awaited `fetch` on Next.js/Express).
3. Adapters strictly fail-open: network timeouts (3,000 ms) and connection refusals are caught silently and never delay the downstream origin response.
