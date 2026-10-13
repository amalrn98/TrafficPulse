import { maskIpAddress } from './ip-utils';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId?: string;
  message: string;
  path?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  siteId?: string;
  actorType?: string;
  clientIp?: string;
  errorCode?: string;
  [key: string]: unknown;
}

/**
 * Strips PII, authentication headers, cookies, and secrets from log metadata.
 */
function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();

    // Redact secret fields
    if (
      lowerKey.includes('key') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('authorization') ||
      lowerKey.includes('cookie')
    ) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Mask IP addresses
    if (lowerKey === 'clientip' || lowerKey === 'ip') {
      sanitized[key] = typeof value === 'string' ? maskIpAddress(value) : value;
      continue;
    }

    // Sanitize URLs to drop query parameters containing potentially sensitive tokens
    if (lowerKey === 'path' || lowerKey === 'url') {
      if (typeof value === 'string') {
        const queryIndex = value.indexOf('?');
        sanitized[key] = queryIndex >= 0 ? value.substring(0, queryIndex) : value;
        continue;
      }
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function outputLog(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...sanitizeMetadata(meta),
  };

  const jsonString = JSON.stringify(entry);

  if (level === 'error') {
    console.error(jsonString);
  } else if (level === 'warn') {
    console.warn(jsonString);
  } else {
    console.log(jsonString);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => outputLog('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => outputLog('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => outputLog('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => outputLog('error', message, meta),
};
