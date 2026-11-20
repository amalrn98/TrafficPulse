import { NextRequest, NextResponse } from 'next/server';
import { TrafficClassifier } from '@trafficpulse/classifier';
import { dbStore } from '@/lib/db';
import { validateIngestPayload } from '@/lib/validation';
import { ingestionRateLimiter, siteRateLimiter } from '@/lib/rate-limit';
import { extractClientIp, maskIpAddress } from '@/lib/ip-utils';
import { logger } from '@/lib/logger';
import { metricsRegistry } from '@/lib/metrics';
import { randomUUID } from 'crypto';
import { isIP } from 'net';

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB limit

/**
 * Builds CORS headers. When the origin is not allowed the Allow-Origin header is
 * omitted entirely (never the literal string "null", which matches opaque origins).
 */
function buildCorsHeaders(origin: string | null, siteDomain?: string): Record<string, string> {
  let allowedOrigin: string | null = null;
  if (origin) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      const isLocalDev =
        process.env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1');
      if (siteDomain) {
        const target = siteDomain.toLowerCase();
        if (host === target || host.endsWith(`.${target}`) || isLocalDev) allowedOrigin = origin;
      } else if (isLocalDev) {
        allowedOrigin = origin;
      }
    } catch {
      allowedOrigin = null;
    }
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Api-Key, X-Idempotency-Key, X-Request-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;
  return headers;
}

/** Reads the request body as text, aborting as soon as it exceeds the limit (no reliance on Content-Length). */
async function readBodyLimited(req: NextRequest, maxBytes: number): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  const siteId = req.nextUrl.searchParams.get('siteId');
  let siteDomain: string | undefined;
  if (siteId && siteId.length <= 64 && /^[a-zA-Z0-9_\-.]+$/.test(siteId)) {
    const site = await dbStore.getSiteById(siteId);
    siteDomain = site?.domain;
  }
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin, siteDomain) });
}

export async function POST(req: NextRequest) {
  const startTime = performance.now();
  const rawRequestId = req.headers.get('x-request-id') || '';
  const requestId = /^[A-Za-z0-9._-]{1,64}$/.test(rawRequestId) ? rawRequestId : randomUUID();
  const origin = req.headers.get('origin');
  let corsHeaders: Record<string, string> = {
    ...buildCorsHeaders(origin),
    'X-Request-Id': requestId,
  };

  const reject = (
    reason: string,
    status: number,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {}
  ) => {
    metricsRegistry.recordIngestRejection(reason);
    return NextResponse.json(body, { status, headers: { ...corsHeaders, ...extraHeaders } });
  };

  // 0. Cheap per-IP limit before any parsing (only when a trustworthy IP is available)
  const transportIp = extractClientIp(req.headers);
  if (transportIp) {
    const ipLimit = await ingestionRateLimiter.check(`ip:${transportIp}`);
    if (!ipLimit.allowed) {
      return reject(
        'rate_limit_exceeded',
        429,
        { error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED', retryAfterSec: ipLimit.retryAfterSec },
        { 'Retry-After': String(ipLimit.retryAfterSec || 1) }
      );
    }
  }

  // 1. Enforce payload size limit (declared and actual)
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    return reject('payload_too_large', 413, { error: 'Payload Too Large', code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_PAYLOAD_BYTES });
  }
  const bodyText = await readBodyLimited(req, MAX_PAYLOAD_BYTES);
  if (bodyText === null) {
    return reject('payload_too_large', 413, { error: 'Payload Too Large', code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_PAYLOAD_BYTES });
  }

  // 2. Parse JSON body safely
  let rawBody: unknown;
  try {
    rawBody = JSON.parse(bodyText);
  } catch {
    return reject('invalid_json', 400, { error: 'Bad Request', code: 'INVALID_JSON', message: 'Request body must be valid JSON' });
  }

  // 3. Schema validation & sanitization (client-supplied classification fields are discarded here)
  const validation = validateIngestPayload(
    rawBody,
    req.headers.get('user-agent') || undefined,
    req.headers.get('referer') || undefined
  );
  if (validation.error || !validation.data) {
    logger.warn('Event rejected: schema validation failure', {
      requestId,
      field: validation.error?.field,
      error: validation.error?.message,
    });
    return reject('validation_failed', 400, {
      error: 'Validation Error',
      code: 'VALIDATION_FAILED',
      field: validation.error?.field,
      message: validation.error?.message,
    });
  }
  const payload = validation.data;

  try {
    // 4. Site authentication.
    //    - With an API key: the key MUST be valid. There is no fallback to siteId lookup.
    //    - Without a key (browser beacon): the site is looked up by public siteId and the
    //      request must carry an Origin that matches the registered domain.
    const authHeader = req.headers.get('authorization') || '';
    const apiKeyHeader = req.headers.get('x-api-key') || '';
    const candidateApiKey = (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : apiKeyHeader).trim();
    const keyed = candidateApiKey.length > 0;

    let site;
    if (keyed) {
      site = await dbStore.getSiteByApiKey(candidateApiKey);
      if (!site) {
        return reject('unauthorized', 401, { error: 'Unauthorized', code: 'INVALID_API_KEY', message: 'Invalid or revoked API key' });
      }
      if (payload.siteId !== site.id) {
        return reject('site_mismatch', 403, { error: 'Forbidden', code: 'SITE_MISMATCH', message: 'siteId does not match the API key' });
      }
    } else {
      if (process.env.REQUIRE_API_KEY === 'true') {
        return reject('unauthorized', 401, { error: 'Unauthorized', code: 'API_KEY_REQUIRED', message: 'An API key is required' });
      }
      site = await dbStore.getSiteById(payload.siteId);
      if (!site) {
        return reject('unauthorized', 401, { error: 'Unauthorized', code: 'SITE_NOT_FOUND', message: 'Unknown site' });
      }
      if (!origin) {
        return reject('unauthorized', 401, { error: 'Unauthorized', code: 'API_KEY_REQUIRED', message: 'Server-side callers must send an API key' });
      }
    }

    corsHeaders = { ...buildCorsHeaders(origin, site.domain), 'X-Request-Id': requestId };

    if (!keyed && !corsHeaders['Access-Control-Allow-Origin']) {
      return reject('origin_mismatch', 403, { error: 'Forbidden', code: 'ORIGIN_MISMATCH', message: 'Request origin does not match registered site domain' });
    }

    // 5. Per-site ceiling (after auth so unknown ids never allocate buckets)
    const siteLimit = await siteRateLimiter.check(`site:${site.id}`);
    if (!siteLimit.allowed) {
      return reject(
        'rate_limit_exceeded',
        429,
        { error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED', retryAfterSec: siteLimit.retryAfterSec },
        { 'Retry-After': String(siteLimit.retryAfterSec || 1) }
      );
    }

    // 6. Effective visitor IP and headers.
    //    Authenticated server-side integrations may report the visitor's IP and headers.
    //    Everyone else is classified from the connection itself.
    let clientIp = transportIp;
    let headerRecord: Record<string, string> | undefined;
    if (keyed) {
      clientIp = payload.clientIp && isIP(payload.clientIp) ? payload.clientIp : '';
      // The transport headers belong to the integration, not the visitor, so only the
      // explicitly forwarded visitor headers are evaluated.
      headerRecord = payload.visitorHeaders;
    } else {
      headerRecord = {};
      req.headers.forEach((val, key) => {
        headerRecord![key] = val;
      });
    }

    // 7. Authoritative server-side classification
    const classStart = performance.now();
    const classification = TrafficClassifier.classify({
      userAgent: payload.userAgent,
      ip: clientIp || undefined,
      method: payload.method,
      path: payload.path,
      headers: headerRecord,
      clientSignals: payload.clientSignals,
    });
    metricsRegistry.recordClassificationLatencyMs(performance.now() - classStart);

    // 8. Privacy-preserving IP masking before persistence
    const maskedIp = maskIpAddress(clientIp);

    const headerKey = (req.headers.get('x-idempotency-key') || '').trim();
    const idempotencyKey =
      payload.idempotencyKey || (headerKey && headerKey.length <= 128 ? headerKey : undefined);

    // 9. Persist
    const dbStart = performance.now();
    const { event, isDuplicate } = await dbStore.recordEvent({
      siteId: site.id,
      idempotencyKey,
      timestamp: payload.timestamp,
      path: payload.path,
      method: payload.method,
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
      userAgent: payload.userAgent,
      ip: maskedIp,
      referer: payload.referer,
      statusCode: payload.statusCode,
      durationMs: payload.durationMs,
      clientHints: payload.clientSignals,
      isDemo: site.isDemo,
    });
    metricsRegistry.recordDbLatencyMs(performance.now() - dbStart);
    metricsRegistry.recordIngestRequest(isDuplicate ? 'duplicate' : 'success', classification.actorType);

    logger.info('Event ingested successfully', {
      requestId,
      siteId: site.id,
      actorType: classification.actorType,
      verificationStatus: classification.verificationStatus,
      isDuplicate,
      durationMs: Math.round((performance.now() - startTime) * 100) / 100,
    });

    return NextResponse.json(
      {
        success: true,
        eventId: event.id,
        actorType: classification.actorType,
        verificationStatus: classification.verificationStatus,
        category: classification.category,
        confidence: classification.confidence,
        isDuplicate,
      },
      { status: isDuplicate ? 200 : 201, headers: corsHeaders }
    );
  } catch (err: unknown) {
    logger.error('Ingestion pipeline error', {
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
    return reject('internal_error', 500, {
      error: 'Internal Server Error',
      code: 'INGESTION_ERROR',
      message: 'An internal error occurred while processing the event',
    });
  }
}
