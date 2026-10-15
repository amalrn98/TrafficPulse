/**
 * Authentication and authorization helpers for the dashboard API.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';

function safeCompareStrings(candidate: string, secret: string): boolean {
  if (!candidate || !secret) return false;
  const bufA = Buffer.from(candidate, 'utf8');
  const bufB = Buffer.from(secret, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates admin authentication via ADMIN_API_KEY environment variable.
 * Accepts header Authorization: Bearer <key> or X-Admin-Key: <key>. Cookie auth is intentionally unsupported (CSRF).
 */
export function verifyAdminAuth(req: NextRequest | Request): { authorized: boolean; error?: string } {
  const adminKey = process.env.ADMIN_API_KEY;

  // In development, if ADMIN_API_KEY is unset, allow requests
  if (!adminKey) {
    if (process.env.NODE_ENV === 'production') {
      return { authorized: false, error: 'ADMIN_API_KEY is not configured on the server' };
    }
    return { authorized: true };
  }

  const authHeader = req.headers.get('authorization') || '';
  const xAdminKey = req.headers.get('x-admin-key') || '';

  let candidate = '';
  if (authHeader.startsWith('Bearer ')) {
    candidate = authHeader.substring(7).trim();
  } else if (xAdminKey) {
    candidate = xAdminKey.trim();
  }

  if (!safeCompareStrings(candidate, adminKey)) {
    return { authorized: false, error: 'Unauthorized: Invalid or missing admin key' };
  }

  return { authorized: true };
}

/**
 * Validates metrics access via METRICS_AUTH_TOKEN or ADMIN_API_KEY.
 * Allows unauthenticated access only if METRICS_PUBLIC === 'true' or in local development.
 */
export function verifyMetricsAuth(req: NextRequest | Request): { authorized: boolean; error?: string } {
  if (process.env.METRICS_PUBLIC === 'true') {
    return { authorized: true };
  }

  const metricsToken = process.env.METRICS_AUTH_TOKEN || process.env.ADMIN_API_KEY;

  if (!metricsToken) {
    if (process.env.NODE_ENV === 'production') {
      return { authorized: false, error: 'METRICS_AUTH_TOKEN or ADMIN_API_KEY must be configured in production' };
    }
    return { authorized: true };
  }

  const authHeader = req.headers.get('authorization') || '';
  const xMetricsToken = req.headers.get('x-metrics-token') || req.headers.get('x-admin-key') || '';

  let candidate = '';
  if (authHeader.startsWith('Bearer ')) {
    candidate = authHeader.substring(7).trim();
  } else if (xMetricsToken) {
    candidate = xMetricsToken.trim();
  }

  if (!safeCompareStrings(candidate, metricsToken)) {
    return { authorized: false, error: 'Unauthorized: Invalid or missing metrics token' };
  }

  return { authorized: true };
}
