/**
 * Safe IP address resolution, proxy trust evaluation, and privacy-preserving masking.
 */

export function extractClientIp(reqHeaders: Headers): string {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production';

  if (trustProxy) {
    // Cloudflare Connecting IP is cryptographically injected by Cloudflare edge
    const cfIp = reqHeaders.get('cf-connecting-ip');
    if (cfIp) return cfIp.trim();

    // Standard forwarded-for: use leftmost client IP if behind trusted reverse proxy
    const xff = reqHeaders.get('x-forwarded-for');
    if (xff) {
      const parts = xff.split(',').map((p) => p.trim());
      if (parts.length > 0 && parts[0]) {
        return parts[0];
      }
    }

    const xRealIp = reqHeaders.get('x-real-ip');
    if (xRealIp) return xRealIp.trim();
  }

  // Fallback
  return '';
}

/**
 * Anonymizes an IP address for storage to minimize personally identifiable data (PII).
 * Masks the last octet of IPv4 (e.g. 192.168.1.0) and truncates IPv6 to /64 (e.g. 2001:db8:1:2::).
 */
export function maskIpAddress(ip?: string | null): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();

  // IPv4 masking
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }

  // IPv6 masking
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length >= 4) {
      return `${parts.slice(0, 4).join(':')}::`;
    }
  }

  return 'masked';
}
