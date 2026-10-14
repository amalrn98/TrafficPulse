import { NextRequest, NextResponse } from 'next/server';
import { TrafficClassifier } from '@trafficpulse/classifier';
import { dbStore } from '@/lib/db';
import { validateIngestPayload } from '@/lib/validation';
import { ingestionRateLimiter } from '@/lib/rate-limit';
import { extractClientIp, maskIpAddress } from '@/lib/ip-utils';
import { logger } from '@/lib/logger';
import { metricsRegistry } from '@/lib/metrics';
import { randomUUID } from 'crypto';

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB limit

function buildCorsHeaders(origin: string | null, siteDomain?: string) {
  let allowedOrigin = 'null';
  if (siteDomain && origin) {
    try {
      const originUrl = new URL(origin);
      const host = originUrl.hostname.toLowerCase();
      const target = siteDomain.toLowerCase();
      const isLocalDev =
        process.env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1');

      if (host === target || host.endsWith(`.${target}`) || isLocalDev) {
        allowedOrigin = origin;
      } else {
        allowedOrigin = 'null';
      }
    } catch {
      allowedOrigin = 'null';
    }
  } else if (!siteDomain && origin && process.env.NODE_ENV !== 'production') {
    allowedOrigin = origin;
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Api-Key, X-Idempotency-Key, X-Request-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  const siteId = req.nextUrl.searchParams.get('siteId');
  let siteDomain: string | undefined;
  if (siteId) {
    const site = await dbStore.getSiteById(siteId);
    siteDomain = site?.domain;
  }
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(origin, siteDomain),
  });
}

export async function POST(req: NextRequest) {
  const startTime = performance.now();
  const requestId = req.headers.get('x-request-id') || randomUUID();
  const origin = req.headers.get('origin');
  const baseCorsHeaders = buildCorsHeaders(origin);
  let corsHeaders: Record<string, string> = {
    ...baseCorsHeaders,
    'X-Request-Id': requestId,
  };

  // 1. Enforce payload size limit
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    metricsRegistry.recordIngestRejection('payload_too_large');
    logger.warn('Event rejected: payload too large', {
      requestId,
      contentLength,
      maxBytes: MAX_PAYLOAD_BYTES,
    });
    return NextResponse.json(
      { error: 'Payload Too Large', code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_PAYLOAD_BYTES },
      { status: 413, headers: corsHeaders }
    );
  }

  // 2. Parse JSON body safely
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    metricsRegistry.recordIngestRejection('invalid_json');
    logger.warn('Event rejected: invalid JSON body', { requestId });
    return NextResponse.json(
      { error: 'Bad Request', code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400, headers: corsHeaders }
    );
  }

  // 3. Schema validation & sanitization (Client-supplied classification fields are discarded here)
  const validation = validateIngestPayload(
    rawBody,
    req.headers.get('user-agent') || undefined,
    req.headers.get('referer') || undefined
  );

  if (validation.error || !validation.data) {
    metricsRegistry.recordIngestRejection('validation_failed');
    logger.warn('Event rejected: schema validation failure', {
      requestId,
      field: validation.error?.field,
      error: validation.error?.message,
    });
    return NextResponse.json(
      {
        error: 'Validation Error',
        code: 'VALIDATION_FAILED',
        field: validation.error?.field,
        message: validation.error?.message,
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const payload = validation.data;

  // 4. Rate Limiting per site and IP
  const clientIp = extractClientIp(req.headers);
  const rateLimitKey = `${payload.siteId}:${clientIp || 'unauthenticated'}`;
  const rateLimitRes = await ingestionRateLimiter.check(rateLimitKey);

  if (!rateLimitRes.allowed) {
    metricsRegistry.recordIngestRejection('rate_limit_exceeded');
    logger.warn('Event rejected: rate limit exceeded', {
      requestId,
      siteId: payload.siteId,
      clientIp,
    });
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Ingestion rate limit exceeded for this client',
        retryAfterSec: rateLimitRes.retryAfterSec,
      },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(rateLimitRes.retryAfterSec || 1),
        },
      }
    );
  }

  try {
    // 5. Site Authentication & Tenant Isolation
    const authHeader = req.headers.get('authorization') || '';
    const apiKeyHeader = req.headers.get('x-api-key') || '';
    const candidateApiKey = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : apiKeyHeader.trim();

    let site = candidateApiKey
      ? await dbStore.getSiteByApiKey(candidateApiKey)
      : await dbStore.getSiteById(payload.siteId);

    if (!site && candidateApiKey) {
      site = await dbStore.getSiteById(payload.siteId);
    }

    if (!site) {
      metricsRegistry.recordIngestRejection('unauthorized');
      logger.warn('Event rejected: unknown or unregistered site', {
        requestId,
        siteId: payload.siteId,
      });
      return NextResponse.json(
        {
          error: 'Unauthorized',
          code: 'SITE_NOT_FOUND',
          message: `Site '${payload.siteId}' is not registered with TrafficPulse.`,
        },
        { status: 401, headers: corsHeaders }
      );
    }

    // Recompute domain-scoped CORS headers against registered site domain (SEC-05)
    corsHeaders = {
      ...buildCorsHeaders(origin, site.domain),
      'X-Request-Id': requestId,
    };

    // Enforce Origin match when an unauthenticated browser beacon includes an Origin header
    if (origin && !candidateApiKey && corsHeaders['Access-Control-Allow-Origin'] === 'null') {
      metricsRegistry.recordIngestRejection('origin_mismatch');
      logger.warn('Event rejected: origin does not match registered site domain', {
        requestId,
        siteId: site.id,
        origin,
        expectedDomain: site.domain,
      });
      return NextResponse.json(
        {
          error: 'Forbidden',
          code: 'ORIGIN_MISMATCH',
          message: 'Request origin does not match registered site domain',
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 6. Header map for classifier
    const headerRecord: Record<string, string> = {};
    req.headers.forEach((val, key) => {
      headerRecord[key] = val;
    });

    // 7. Authoritative Server-Side Classification
    const classStart = performance.now();
    const classification = TrafficClassifier.classify({
      userAgent: payload.userAgent,
      ip: clientIp || undefined,
      method: payload.method,
      path: payload.path,
      headers: headerRecord,
      clientSignals: payload.clientSignals,
    });
    const classDuration = performance.now() - classStart;
    metricsRegistry.recordClassificationLatencyMs(classDuration);

    // 8. Privacy-Preserving IP Masking before persistence
    const maskedIp = maskIpAddress(clientIp);

    // Check header for idempotency key if not in payload
    const idempotencyKey =
      payload.idempotencyKey || req.headers.get('x-idempotency-key') || undefined;

    // 9. Persistent Storage Operation
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
    const dbDuration = performance.now() - dbStart;
    metricsRegistry.recordDbLatencyMs(dbDuration);

    metricsRegistry.recordIngestRequest(
      isDuplicate ? 'duplicate' : 'success',
      classification.actorType
    );

    const totalDuration = performance.now() - startTime;
    logger.info('Event ingested successfully', {
      requestId,
      siteId: site.id,
      actorType: classification.actorType,
      verificationStatus: classification.verificationStatus,
      isDuplicate,
      durationMs: Math.round(totalDuration * 100) / 100,
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
      {
        status: isDuplicate ? 200 : 201,
        headers: corsHeaders,
      }
    );
  } catch (err: unknown) {
    metricsRegistry.recordIngestRejection('internal_error');
    logger.error('Ingestion pipeline error', {
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        code: 'INGESTION_ERROR',
        message: 'An internal error occurred while processing the event',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
