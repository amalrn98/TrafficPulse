/**
 * Safe IP address resolution, proxy trust evaluation, and privacy-preserving masking.
 */

import { isIP } from 'net';

function cleanIp(raw: string | null | undefined): string {
  if (!raw) return '';
  let v = raw.trim();
  // Strip IPv4 port (1.2.3.4:5678) and bracketed IPv6 ([::1]:443)
  const bracket = v.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) v = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.split(':')[0];
  // Unwrap IPv4-mapped IPv6 (::ffff:1.2.3.4)
  const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) v = mapped[1];
  return isIP(v) ? v : '';
}

/**
 * Resolves the client IP. Forwarding headers are only used when TRUST_PROXY=true.
 *
 * X-Forwarded-For is client-appendable, so the leftmost entry is attacker
 * controlled. We take the entry TRUSTED_PROXY_HOPS positions from the right
 * (default 1: the address the nearest trusted proxy saw connect to it).
 * Returns '' when no trustworthy address is available.
 */
export function extractClientIp(reqHeaders: Headers): string {
  if (process.env.TRUST_PROXY !== 'true') return '';

  // Set by Cloudflare's edge; only trustworthy if the origin accepts traffic solely from Cloudflare.
  const cfIp = cleanIp(reqHeaders.get('cf-connecting-ip'));
  if (cfIp) return cfIp;

  const hops = Math.max(1, parseInt(process.env.TRUSTED_PROXY_HOPS || '1', 10) || 1);
  const xff = reqHeaders.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    const idx = parts.length - hops;
    if (idx >= 0) {
      const ip = cleanIp(parts[idx]);
      if (ip) return ip;
    }
  }

  return cleanIp(reqHeaders.get('x-real-ip'));
}

/** Expands any valid IPv6 string into 8 hex groups, or null if invalid. */
function expandIpv6(ip: string): string[] | null {
  if (isIP(ip) !== 6) return null;
  let addr = ip.split('%')[0].toLowerCase();
  const v4 = addr.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const o = v4[2].split('.').map(Number);
    addr = `${v4[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? left.length !== 8 : missing < 0) return null;
  const groups = halves.length === 1 ? left : [...left, ...Array(missing).fill('0'), ...right];
  return groups.map((g) => g.replace(/^0+(?=.)/, ''));
}

/**
 * Anonymizes an IP address for storage to minimize personally identifiable data (PII).
 * IPv4: last octet zeroed (192.168.1.0). IPv6: truncated to /64 (2001:db8:1:2::),
 * including compressed forms such as 2001:db8::1.
 */
export function maskIpAddress(ip?: string | null): string | null {
  const cleaned = cleanIp(ip);
  if (!cleaned) return ip ? 'masked' : null;

  if (isIP(cleaned) === 4) {
    const parts = cleaned.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }

  const groups = expandIpv6(cleaned);
  if (!groups) return 'masked';
  return `${groups.slice(0, 4).join(':')}::`;
}
