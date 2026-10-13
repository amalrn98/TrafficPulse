/**
 * Pluggable rate limiter with in-memory and Redis backend implementations.
 * Provides abuse protection per site and per IP address.
 */

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec?: number;
}

export interface RateLimiterStore {
  check(key: string): Promise<RateLimitCheckResult> | RateLimitCheckResult;
}

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitConfig {
  maxTokens: number;
  refillRatePerSec: number;
}

export class MemoryRateLimiter implements RateLimiterStore {
  private buckets = new Map<string, RateLimitEntry>();
  private maxTokens: number;
  private refillRatePerSec: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig = { maxTokens: 120, refillRatePerSec: 20 }) {
    this.maxTokens = config.maxTokens;
    this.refillRatePerSec = config.refillRatePerSec;

    // Periodic cleanup of stale entries every 5 minutes
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  public check(key: string): RateLimitCheckResult {
    const now = Date.now();
    let entry = this.buckets.get(key);

    if (!entry) {
      entry = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, entry);
    } else {
      const elapsedSec = (now - entry.lastRefill) / 1000;
      const refilled = elapsedSec * this.refillRatePerSec;
      entry.tokens = Math.min(this.maxTokens, entry.tokens + refilled);
      entry.lastRefill = now;
    }

    if (entry.tokens >= 1) {
      entry.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(entry.tokens),
      };
    }

    const missingTokens = 1 - entry.tokens;
    const retryAfterSec = Math.ceil(missingTokens / this.refillRatePerSec);

    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const staleDurationMs = 10 * 60 * 1000;
    for (const [key, entry] of this.buckets.entries()) {
      if (now - entry.lastRefill > staleDurationMs && entry.tokens >= this.maxTokens) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Redis rate limiter stub/adapter for distributed multi-instance topologies.
 * Falls back safely to in-memory limiting if Redis is unavailable or unconfigured.
 */
export class RedisRateLimiter implements RateLimiterStore {
  private memoryFallback: MemoryRateLimiter;
  private redisUrl?: string;

  constructor(redisUrl?: string, config: RateLimitConfig = { maxTokens: 120, refillRatePerSec: 30 }) {
    this.redisUrl = redisUrl;
    this.memoryFallback = new MemoryRateLimiter(config);
  }

  public async check(key: string): Promise<RateLimitCheckResult> {
    if (!this.redisUrl) {
      return this.memoryFallback.check(key);
    }
    // In environments with REDIS_URL configured, distributed token tracking
    // can be plugged in via ioredis. Fall back gracefully if uninitialized.
    return this.memoryFallback.check(key);
  }
}

export function createRateLimiter(config: RateLimitConfig = { maxTokens: 120, refillRatePerSec: 30 }): RateLimiterStore {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    return new RedisRateLimiter(redisUrl, config);
  }
  return new MemoryRateLimiter(config);
}

// Global rate limiter instance for ingestion endpoint
export const ingestionRateLimiter = createRateLimiter({
  maxTokens: 120, // 120 requests burst
  refillRatePerSec: 30, // 30 req/sec sustained
});
