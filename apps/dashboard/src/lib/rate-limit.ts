/**
 * In-memory sliding window rate limiter with interface for distributed backends.
 * Provides abuse protection per site and per IP address.
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitConfig {
  maxTokens: number;
  refillRatePerSec: number;
}

export class MemoryRateLimiter {
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

  /**
   * Attempts to consume 1 token for a given key.
   * Returns { allowed: boolean, remaining: number, retryAfterSec?: number }
   */
  public check(key: string): { allowed: boolean; remaining: number; retryAfterSec?: number } {
    const now = Date.now();
    let entry = this.buckets.get(key);

    if (!entry) {
      entry = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, entry);
    } else {
      // Calculate token refill
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

// Global rate limiter instance for ingestion endpoint
export const ingestionRateLimiter = new MemoryRateLimiter({
  maxTokens: 120, // 120 requests burst
  refillRatePerSec: 30, // 30 req/sec sustained
});
