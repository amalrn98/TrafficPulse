/**
 * Authentication and authorization helpers for the dashboard API.
 */

import { NextRequest } from 'next/server';

/**
 * Validates admin authentication via ADMIN_API_KEY environment variable.
 * Accepts header Authorization: Bearer <key> or X-Admin-Key: <key>.
 */
export function verifyAdminAuth(req: NextRequest): { authorized: boolean; error?: string } {
  const adminKey = process.env.ADMIN_API_KEY;

  // In development, if ADMIN_API_KEY is unset, allow requests with a warning
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

  if (!candidate || candidate !== adminKey) {
    return { authorized: false, error: 'Unauthorized: Invalid or missing admin key' };
  }

  return { authorized: true };
}
