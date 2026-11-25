/**
 * Authentication and authorization helpers for the dashboard API.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';

/** Secrets copied unchanged from .env.example must never grant access. */
function isPlaceholderSecret(v: string): boolean {
  return /change_this|tp_metrics_secret_token|tp_admin_change/i.test(v);
}

function safeCompareStrings(candidate: string, secret: string): boolean {
  if (!candidate || !secret) return false;
  // Constant-time comparison. Length is the only thing a mismatch can reveal, which is standard
  // for equality checks on fixed-format secrets. (This is a comparison, not password storage.)
  const bufA = Buffer.from(candidate, 'utf8');
  const bufB = Buffer.from(secret, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufB, bufB); // keep timing independent of the candidate
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
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
