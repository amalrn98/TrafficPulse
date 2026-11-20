/**
 * Authentication and authorization helpers for the dashboard API.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';

const COMPARE_KEY = crypto.randomBytes(32);

/** Secrets copied unchanged from .env.example must never grant access. */
function isPlaceholderSecret(v: string): boolean {
  return /change_this|tp_metrics_secret_token|tp_admin_change/i.test(v);
}

function safeCompareStrings(candidate: string, secret: string): boolean {
  if (!candidate || !secret) return false;
  // MAC both sides with a random per-process key so the compared buffers always have equal
  // length (no length leak). This is not password storage, so a KDF does not apply.
  const a = crypto.createHmac('sha256', COMPARE_KEY).update(candidate, 'utf8').digest();
  const b = crypto.createHmac('sha256', COMPARE_KEY).update(secret, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Validates admin authentication via ADMIN_API_KEY environment variable.
 * Accepts header Authorization: Bearer <key> or X-Admin-Key: <key>.
 * Cookies are intentionally not accepted (no CSRF surface).
 */
export function verifyAdminAuth(req: NextRequest | Request): { authorized: boolean; error?: string } {
  const adminKey = process.env.ADMIN_API_KEY;

  if (adminKey && process.env.NODE_ENV === 'production' && isPlaceholderSecret(adminKey)) {
    return { authorized: false, error: 'ADMIN_API_KEY is still the example placeholder; set a random value' };
  }

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

  if (metricsToken && process.env.NODE_ENV === 'production' && isPlaceholderSecret(metricsToken)) {
    return { authorized: false, error: 'METRICS_AUTH_TOKEN is still the example placeholder; set a random value' };
  }

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
