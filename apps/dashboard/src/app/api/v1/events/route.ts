import { NextRequest, NextResponse } from 'next/server';
import { TrafficClassifier } from '@trafficpulse/classifier';
import { dbStore } from '@/lib/db';
import { validateIngestPayload } from '@/lib/validation';
import { ingestionRateLimiter } from '@/lib/rate-limit';
import { extractClientIp, maskIpAddress } from '@/lib/ip-utils';

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB limit

function buildCorsHeaders(origin: string | null, siteDomain?: string) {
  // If origin is provided and matches or is development, reflect the origin; otherwise use safe default
  const allowedOrigin = origin || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Api-Key, X-Idempotency-Key',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(origin),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);

  // 1. Enforce payload size limit
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
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
  const rateLimitRes = ingestionRateLimiter.check(rateLimitKey);

  if (!rateLimitRes.allowed) {
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
    let site = await dbStore.getSiteById(payload.siteId);

    // Support server-to-server middleware authentication via API key
    const authHeader = req.headers.get('authorization') || '';
    const apiKeyHeader = req.headers.get('x-api-key') || '';
    const candidateApiKey = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7).trim()
      : apiKeyHeader.trim();

    if (!site && candidateApiKey) {
      site = await dbStore.getSiteByApiKey(candidateApiKey);
    }

    if (!site) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          code: 'SITE_NOT_FOUND',
          message: `Site '${payload.siteId}' is not registered with TrafficPulse.`,
        },
        { status: 401, headers: corsHeaders }
      );
    }

    // 6. Header map for classifier
    const headerRecord: Record<string, string> = {};
    req.headers.forEach((val, key) => {
      headerRecord[key] = val;
    });

    // 7. Authoritative Server-Side Classification
    // NOTE: Client claims are untrusted. Classification is computed strictly from verified evidence.
    const classification = TrafficClassifier.classify({
      userAgent: payload.userAgent,
      ip: clientIp || undefined,
      method: payload.method,
      path: payload.path,
      headers: headerRecord,
      clientSignals: payload.clientSignals,
    });

    // 8. Privacy-Preserving IP Masking before persistence
    const maskedIp = maskIpAddress(clientIp);

    // Check header for idempotency key if not in payload
    const idempotencyKey =
      payload.idempotencyKey || req.headers.get('x-idempotency-key') || undefined;

    // 9. Persistent Storage Operation
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
    // Sanitize internal errors - never leak database credentials, stack traces, or SQL errors to client
    console.error('Ingestion pipeline error:', err instanceof Error ? err.message : String(err));

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
