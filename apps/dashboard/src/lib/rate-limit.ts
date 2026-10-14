/**
 * Pluggable rate limiter with in-memory and distributed Redis RESP backend implementations.
 * Provides abuse protection per site and per IP address without external npm dependencies.
 */

import net from 'net';
import tls from 'tls';

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
  timeoutMs?: number;
}

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local maxTokens = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(data[1])
local lastRefill = tonumber(data[2])
if tokens == nil or lastRefill == nil then
  tokens = maxTokens
  lastRefill = nowMs
else
  local elapsedSec = math.max(0, (nowMs - lastRefill) / 1000.0)
  tokens = math.min(maxTokens, tokens + (elapsedSec * refillRate))
  lastRefill = nowMs
end
local allowed = 0
local retryAfterSec = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retryAfterSec = math.ceil((1 - tokens) / refillRate)
end
local ttlSec = math.max(60, math.ceil((maxTokens / refillRate) * 2))
redis.call('HMSET', key, 'tokens', tostring(tokens), 'lastRefill', tostring(lastRefill))
redis.call('EXPIRE', key, ttlSec)
return { allowed, math.floor(tokens), retryAfterSec }
`.trim();

function encodeRespCommand(args: string[]): string {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const byteLen = Buffer.byteLength(arg, 'utf8');
    out += `$${byteLen}\r\n${arg}\r\n`;
  }
  return out;
}

function parseRespIntegerArray(buffer: string): [number, number, number] | null {
  const lines = buffer.split('\r\n');
  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx];
    if (line === '*3' && idx + 3 < lines.length) {
      const a = parseInt(lines[idx + 1].replace(/^:/, ''), 10);
      const b = parseInt(lines[idx + 2].replace(/^:/, ''), 10);
      const c = parseInt(lines[idx + 3].replace(/^:/, ''), 10);
      if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c)) {
        return [a, b, c];
      }
    }
    idx++;
  }
  return null;
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
 * Distributed Redis rate limiter using native Node net/tls RESP protocol and atomic Lua evaluation.
 * Falls back safely to in-memory limiting if Redis is unreachable or times out.
 */
export class RedisRateLimiter implements RateLimiterStore {
  private memoryFallback: MemoryRateLimiter;
  private redisUrl?: string;
  private maxTokens: number;
  private refillRatePerSec: number;
  private timeoutMs: number;

  constructor(redisUrl?: string, config: RateLimitConfig = { maxTokens: 120, refillRatePerSec: 30, timeoutMs: 150 }) {
    this.redisUrl = redisUrl;
    this.maxTokens = config.maxTokens;
    this.refillRatePerSec = config.refillRatePerSec;
    this.timeoutMs = config.timeoutMs ?? 150;
    this.memoryFallback = new MemoryRateLimiter(config);
  }

  public async check(key: string): Promise<RateLimitCheckResult> {
    if (!this.redisUrl) {
      return this.memoryFallback.check(key);
    }

    try {
      const res = await this.evalTokenBucket(`tp:rl:${key}`);
      if (!res) {
        return this.memoryFallback.check(key);
      }
      const [allowedFlag, remaining, retryAfterSec] = res;
      if (allowedFlag === 1) {
        return {
          allowed: true,
          remaining,
        };
      }
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, retryAfterSec),
      };
    } catch {
      // Fail-open to local memory limiter when Redis is unreachable
      return this.memoryFallback.check(key);
    }
  }

  private evalTokenBucket(redisKey: string): Promise<[number, number, number] | null> {
    return new Promise((resolve) => {
      if (!this.redisUrl) {
        resolve(null);
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(this.redisUrl);
      } catch {
        resolve(null);
        return;
      }

      const isTls = parsed.protocol === 'rediss:';
      const host = parsed.hostname || '127.0.0.1';
      const port = parsed.port ? parseInt(parsed.port, 10) : 6379;
      const password = parsed.password ? decodeURIComponent(parsed.password) : '';
      const username = parsed.username ? decodeURIComponent(parsed.username) : '';
      const dbIndex = parsed.pathname && parsed.pathname.length > 1 ? parseInt(parsed.pathname.slice(1), 10) : 0;

      let settled = false;
      const finish = (val: [number, number, number] | null, sock?: net.Socket) => {
        if (settled) return;
        settled = true;
        if (sock && !sock.destroyed) {
          sock.destroy();
        }
        resolve(val);
      };

      const socket = isTls
        ? tls.connect({ host, port, servername: host })
        : net.createConnection({ host, port });

      socket.setTimeout(this.timeoutMs);

      let buffer = '';
      socket.on('connect', () => {
        let payload = '';
        if (password) {
          payload += username
            ? encodeRespCommand(['AUTH', username, password])
            : encodeRespCommand(['AUTH', password]);
        }
        if (dbIndex > 0 && !Number.isNaN(dbIndex)) {
          payload += encodeRespCommand(['SELECT', String(dbIndex)]);
        }
        payload += encodeRespCommand([
          'EVAL',
          TOKEN_BUCKET_LUA,
          '1',
          redisKey,
          String(this.maxTokens),
          String(this.refillRatePerSec),
          String(Date.now()),
        ]);
        socket.write(payload);
      });

      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const parsedReply = parseRespIntegerArray(buffer);
        if (parsedReply) {
          finish(parsedReply, socket);
        } else if (buffer.includes('-ERR') || buffer.includes('-NOAUTH') || buffer.includes('-WRONGPASS')) {
          finish(null, socket);
        }
      });

      socket.on('timeout', () => finish(null, socket));
      socket.on('error', () => finish(null, socket));
      socket.on('close', () => finish(null, socket));
    });
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
