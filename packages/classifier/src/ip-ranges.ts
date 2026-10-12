import { ActorFamily } from './types';

/**
 * CIDR blocks and IP ranges for major crawler and AI organizations.
 * Provenance: Published official documentation, ASNs, and bot IP lists.
 */
export interface ProviderRangeInfo {
  actorFamily: ActorFamily;
  organization: string;
  cidrs: string[];
  source: string;
  lastUpdated: string;
}

export const VERIFIED_NETWORKS: Record<string, ProviderRangeInfo> = {
  OpenAI: {
    actorFamily: 'OpenAI',
    organization: 'OpenAI, LLC',
    cidrs: [
      '20.15.240.0/20',
      '20.171.206.0/23',
      '40.83.2.0/24',
      '52.230.152.0/24',
      '13.107.246.0/24',
      '2603:1030:206::/48',
    ],
    source: 'https://openai.com/gptbot.json',
    lastUpdated: '2026-03-01',
  },
  Anthropic: {
    actorFamily: 'Anthropic',
    organization: 'Anthropic PBC',
    cidrs: [
      '160.79.104.0/23',
      '2607:6bc0::/32',
    ],
    source: 'https://www.anthropic.com/claudebot.json',
    lastUpdated: '2026-03-01',
  },
  Google: {
    actorFamily: 'Google',
    organization: 'Google LLC',
    cidrs: [
      '66.249.64.0/19',
      '64.233.160.0/19',
      '72.14.192.0/18',
      '209.85.128.0/17',
      '2001:4860:4801::/48',
    ],
    source: 'https://developers.google.com/search/apis/ipranges/googlebot.json',
    lastUpdated: '2026-03-01',
  },
  Microsoft: {
    actorFamily: 'Microsoft',
    organization: 'Microsoft Corporation',
    cidrs: [
      '40.77.167.0/24',
      '157.55.39.0/24',
      '207.46.13.0/24',
      '13.66.139.0/24',
      '2a01:111:2006::/48',
    ],
    source: 'https://www.bing.com/toolbox/bingbot.json',
    lastUpdated: '2026-03-01',
  },
  Perplexity: {
    actorFamily: 'Perplexity',
    organization: 'Perplexity AI, Inc.',
    cidrs: [
      '198.181.160.0/20',
      '108.165.184.0/21',
    ],
    source: 'Perplexity published ASN / IP blocks',
    lastUpdated: '2026-03-01',
  },
};

/**
 * Parses an IPv4 string into a 32-bit unsigned integer.
 * Returns null if the format is invalid or out of range.
 */
export function parseIpv4(ip: string): number | null {
  const trimmed = ip.trim();
  const match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;

  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  for (const octet of octets) {
    if (octet < 0 || octet > 255) return null;
  }

  return (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0);
}

/**
 * Normalizes and converts an IPv6 string into a 128-bit BigInt.
 * Supports IPv4-mapped addresses (::ffff:192.0.2.1) and standard shorthand.
 * Returns null if invalid.
 */
export function parseIpv6(ip: string): bigint | null {
  let cleaned = ip.trim().toLowerCase();

  // Strip zone index if present, e.g. fe80::1%eth0
  const zoneIndex = cleaned.indexOf('%');
  if (zoneIndex !== -1) {
    cleaned = cleaned.substring(0, zoneIndex);
  }

  // Handle IPv4-mapped IPv6: ::ffff:192.0.2.1
  const v4Match = cleaned.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Match) {
    const v4Int = parseIpv4(v4Match[2]);
    if (v4Int === null) return null;
    const hi16 = ((v4Int >>> 16) & 0xffff).toString(16);
    const lo16 = (v4Int & 0xffff).toString(16);
    cleaned = `${v4Match[1]}${hi16}:${lo16}`;
  }

  // Only allow hex characters and colons
  if (!/^[0-9a-f:]+$/.test(cleaned)) return null;

  const doubleColonCount = (cleaned.match(/::/g) || []).length;
  if (doubleColonCount > 1) return null;

  let parts: string[];
  if (doubleColonCount === 1) {
    const [left, right] = cleaned.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    const missing = 8 - (leftParts.length + rightParts.length);
    if (missing < 1) return null;
    const mid = new Array(missing).fill('0');
    parts = [...leftParts, ...mid, ...rightParts];
  } else {
    parts = cleaned.split(':');
  }

  if (parts.length !== 8) return null;

  let result = 0n;
  for (const part of parts) {
    if (part.length === 0 || part.length > 4) return null;
    const val = parseInt(part, 16);
    if (isNaN(val) || val < 0 || val > 0xffff) return null;
    result = (result << 16n) | BigInt(val);
  }

  return result;
}

/**
 * Checks whether an IP address falls within a given CIDR network.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false;

  const [baseIp, prefixStr] = cidr.trim().split('/');
  if (!baseIp) return false;

  const isV4 = ip.includes('.');
  const baseIsV4 = baseIp.includes('.');

  // Check IPv4 CIDR matching
  if (isV4 && baseIsV4) {
    const ipNum = parseIpv4(ip);
    const baseNum = parseIpv4(baseIp);
    if (ipNum === null || baseNum === null) return false;

    const prefix = prefixStr !== undefined ? parseInt(prefixStr, 10) : 32;
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

    if (prefix === 0) return true;
    const mask = (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (baseNum & mask);
  }

  // Check IPv6 CIDR matching
  if (!isV4 && !baseIsV4) {
    const ipBig = parseIpv6(ip);
    const baseBig = parseIpv6(baseIp);
    if (ipBig === null || baseBig === null) return false;

    const prefix = prefixStr !== undefined ? parseInt(prefixStr, 10) : 128;
    if (isNaN(prefix) || prefix < 0 || prefix > 128) return false;

    if (prefix === 0) return true;
    const shift = BigInt(128 - prefix);
    return (ipBig >> shift) === (baseBig >> shift);
  }

  return false;
}

/**
 * Checks whether an IP address matches any of the given CIDRs.
 */
export function matchIpToCidrs(ip: string, cidrs: string[]): { matches: boolean; matchedCidr?: string } {
  for (const cidr of cidrs) {
    if (isIpInCidr(ip, cidr)) {
      return { matches: true, matchedCidr: cidr };
    }
  }
  return { matches: false };
}

/**
 * Verifies if an IP belongs to the network ranges associated with an actor family.
 */
export function verifyIpOrigin(ip?: string, actorFamily?: ActorFamily): boolean {
  if (!ip || !actorFamily) return false;
  const info = VERIFIED_NETWORKS[actorFamily];
  if (!info) return false;

  return matchIpToCidrs(ip, info.cidrs).matches;
}

/**
 * Detailed IP verification with matched CIDR details.
 */
export function inspectIpOrigin(
  ip?: string,
  actorFamily?: ActorFamily
): { verified: boolean; matchedCidr?: string; actorFamily?: ActorFamily } {
  if (!ip || !actorFamily) return { verified: false };
  const info = VERIFIED_NETWORKS[actorFamily];
  if (!info) return { verified: false };

  const res = matchIpToCidrs(ip, info.cidrs);
  return {
    verified: res.matches,
    matchedCidr: res.matchedCidr,
    actorFamily,
  };
}
