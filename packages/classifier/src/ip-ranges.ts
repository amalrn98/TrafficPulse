import { ActorFamily } from './types';

/**
 * CIDR blocks and IP prefixes for major crawler organizations.
 * Used for origin verification to differentiate genuine crawlers from spoofed User-Agents.
 */
export const VERIFIED_IP_PREFIXES: Record<string, string[]> = {
  OpenAI: [
    '20.15.240.',
    '20.15.241.',
    '20.171.206.',
    '20.171.207.',
    '40.83.2.',
    '52.230.152.',
    '13.107.246.',
  ],
  Anthropic: [
    '160.79.104.',
    '160.79.105.',
  ],
  Google: [
    '66.249.',
    '64.233.',
    '72.14.',
    '209.85.',
  ],
  Microsoft: [
    '40.77.',
    '157.55.',
    '207.46.',
    '13.66.',
  ],
  Perplexity: [
    '198.181.',
    '108.165.',
  ],
};

/**
 * Checks if an IP matches any known CIDR or prefix for a given actor family.
 */
export function verifyIpOrigin(ip?: string, actorFamily?: ActorFamily): boolean {
  if (!ip || !actorFamily) return false;
  const prefixes = VERIFIED_IP_PREFIXES[actorFamily];
  if (!prefixes) return false;

  return prefixes.some(prefix => ip.startsWith(prefix));
}
