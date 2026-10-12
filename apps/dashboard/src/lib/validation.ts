/**
 * Strict schema validation and sanitization for the event ingestion pipeline.
 */

export interface ValidatedIngestEvent {
  siteId: string;
  idempotencyKey?: string;
  timestamp: string;
  path: string;
  method: string;
  statusCode: number;
  durationMs?: number;
  userAgent: string;
  referer?: string;
  clientSignals?: {
    webdriver?: boolean;
    hasChromeObject?: boolean;
    hasPlugins?: boolean;
    screenConsistency?: boolean;
    webglRenderer?: string;
    mouseEntropy?: number;
    scrollEntropy?: number;
    dwellTimeMs?: number;
    interactionCount?: number;
    viewportWidth?: number;
    viewportHeight?: number;
  };
  // Explicitly note: Any client-supplied classification fields are excluded
}

export interface ValidationError {
  field: string;
  message: string;
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

export function validateIngestPayload(
  rawBody: unknown,
  rawUaHeader?: string,
  rawRefererHeader?: string
): { data?: ValidatedIngestEvent; error?: ValidationError } {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { error: { field: 'body', message: 'Payload must be a non-null JSON object' } };
  }

  const b = rawBody as Record<string, any>;

  // 1. Site Identifier
  if (!b.siteId || typeof b.siteId !== 'string') {
    return { error: { field: 'siteId', message: 'Missing or invalid siteId (must be a non-empty string)' } };
  }
  const cleanSiteId = b.siteId.trim();
  if (cleanSiteId.length > 64 || !/^[a-zA-Z0-9_\-\.]+$/.test(cleanSiteId)) {
    return { error: { field: 'siteId', message: 'siteId exceeds 64 characters or contains invalid characters' } };
  }

  // 2. Idempotency Key (optional)
  let cleanIdempotencyKey: string | undefined;
  if (b.idempotencyKey !== undefined && b.idempotencyKey !== null) {
    if (typeof b.idempotencyKey !== 'string') {
      return { error: { field: 'idempotencyKey', message: 'idempotencyKey must be a string' } };
    }
    const ik = b.idempotencyKey.trim();
    if (ik.length > 128) {
      return { error: { field: 'idempotencyKey', message: 'idempotencyKey cannot exceed 128 characters' } };
    }
    if (ik.length > 0) {
      cleanIdempotencyKey = ik;
    }
  }

  // 3. Path
  let cleanPath = '/';
  if (b.path !== undefined) {
    if (typeof b.path !== 'string') {
      return { error: { field: 'path', message: 'path must be a string' } };
    }
    const p = b.path.trim();
    if (p.length > 2048) {
      return { error: { field: 'path', message: 'path cannot exceed 2048 characters' } };
    }
    cleanPath = p.startsWith('/') ? p : `/${p}`;
  }

  // 4. Method
  let cleanMethod = 'GET';
  if (b.method !== undefined) {
    if (typeof b.method !== 'string') {
      return { error: { field: 'method', message: 'method must be a string' } };
    }
    const m = b.method.trim().toUpperCase();
    if (!ALLOWED_METHODS.has(m)) {
      return { error: { field: 'method', message: `Invalid HTTP method: ${m}` } };
    }
    cleanMethod = m;
  }

  // 5. Timestamp validation and bounds checking (prevent massive clock skew / replay abuse)
  let cleanTimestamp = new Date().toISOString();
  if (b.timestamp !== undefined) {
    if (typeof b.timestamp !== 'string') {
      return { error: { field: 'timestamp', message: 'timestamp must be an ISO date string' } };
    }
    const parsedDate = new Date(b.timestamp);
    if (isNaN(parsedDate.getTime())) {
      return { error: { field: 'timestamp', message: 'Invalid date format for timestamp' } };
    }

    const now = Date.now();
    const eventTime = parsedDate.getTime();
    const maxFutureMs = 24 * 60 * 60 * 1000; // 24 hours future max
    const maxPastMs = 7 * 24 * 60 * 60 * 1000; // 7 days past max

    if (eventTime > now + maxFutureMs || eventTime < now - maxPastMs) {
      return {
        error: {
          field: 'timestamp',
          message: 'Timestamp is outside acceptable ingestion window (must be within past 7 days and future 24h)',
        },
      };
    }
    cleanTimestamp = parsedDate.toISOString();
  }

  // 6. User-Agent
  let cleanUa = '';
  const candidateUa = b.userAgent || b.requestHeaders?.userAgent || rawUaHeader || '';
  if (typeof candidateUa === 'string') {
    cleanUa = candidateUa.trim().slice(0, 1024);
  }

  // 7. Referer
  let cleanReferer: string | undefined;
  const candidateReferer = b.referer || b.requestHeaders?.referer || rawRefererHeader;
  if (typeof candidateReferer === 'string') {
    cleanReferer = candidateReferer.trim().slice(0, 2048);
  }

  // 8. Status Code
  let cleanStatusCode = 200;
  if (b.statusCode !== undefined) {
    if (typeof b.statusCode !== 'number' || !Number.isInteger(b.statusCode)) {
      return { error: { field: 'statusCode', message: 'statusCode must be an integer' } };
    }
    if (b.statusCode < 100 || b.statusCode > 599) {
      return { error: { field: 'statusCode', message: 'statusCode must be between 100 and 599' } };
    }
    cleanStatusCode = b.statusCode;
  }

  // 9. Duration Ms
  let cleanDurationMs: number | undefined;
  if (b.durationMs !== undefined && b.durationMs !== null) {
    if (typeof b.durationMs !== 'number' || !Number.isInteger(b.durationMs)) {
      return { error: { field: 'durationMs', message: 'durationMs must be an integer' } };
    }
    if (b.durationMs < 0 || b.durationMs > 300000) {
      return { error: { field: 'durationMs', message: 'durationMs must be between 0 and 300000' } };
    }
    cleanDurationMs = b.durationMs;
  }

  // 10. Client Telemetry Signals (Strict sanitization & data minimization)
  let cleanSignals: ValidatedIngestEvent['clientSignals'];
  if (b.clientSignals && typeof b.clientSignals === 'object' && !Array.isArray(b.clientSignals)) {
    const cs = b.clientSignals;

    // Defense-in-depth: Reject any attempt to transmit keystroke strings or form contents
    if (cs.key !== undefined || cs.keys !== undefined || cs.keystrokes !== undefined || cs.inputs !== undefined) {
      return {
        error: {
          field: 'clientSignals',
          message: 'Privacy violation: Raw keystroke or form inputs are prohibited by TrafficPulse policy',
        },
      };
    }

    cleanSignals = {
      webdriver: typeof cs.webdriver === 'boolean' ? cs.webdriver : undefined,
      hasChromeObject: typeof cs.hasChromeObject === 'boolean' ? cs.hasChromeObject : undefined,
      hasPlugins: typeof cs.hasPlugins === 'boolean' ? cs.hasPlugins : undefined,
      screenConsistency: typeof cs.screenConsistency === 'boolean' ? cs.screenConsistency : undefined,
      webglRenderer: typeof cs.webglRenderer === 'string' ? cs.webglRenderer.slice(0, 128) : undefined,
      mouseEntropy: typeof cs.mouseEntropy === 'number' && cs.mouseEntropy >= 0 && cs.mouseEntropy <= 10 ? Math.round(cs.mouseEntropy * 100) / 100 : undefined,
      scrollEntropy: typeof cs.scrollEntropy === 'number' && cs.scrollEntropy >= 0 && cs.scrollEntropy <= 10 ? Math.round(cs.scrollEntropy * 100) / 100 : undefined,
      dwellTimeMs: typeof cs.dwellTimeMs === 'number' && cs.dwellTimeMs >= 0 && cs.dwellTimeMs <= 86400000 ? Math.floor(cs.dwellTimeMs) : undefined,
      interactionCount: typeof cs.interactionCount === 'number' && cs.interactionCount >= 0 && cs.interactionCount <= 100000 ? Math.floor(cs.interactionCount) : undefined,
      viewportWidth: typeof cs.viewportWidth === 'number' && cs.viewportWidth >= 0 && cs.viewportWidth <= 10000 ? Math.floor(cs.viewportWidth) : undefined,
      viewportHeight: typeof cs.viewportHeight === 'number' && cs.viewportHeight >= 0 && cs.viewportHeight <= 10000 ? Math.floor(cs.viewportHeight) : undefined,
    };
  }

  return {
    data: {
      siteId: cleanSiteId,
      idempotencyKey: cleanIdempotencyKey,
      timestamp: cleanTimestamp,
      path: cleanPath,
      method: cleanMethod,
      statusCode: cleanStatusCode,
      durationMs: cleanDurationMs,
      userAgent: cleanUa,
      referer: cleanReferer,
      clientSignals: cleanSignals,
    },
  };
}
