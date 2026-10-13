#!/usr/bin/env node
/**
 * CIDR Refresh Script
 *
 * Fetches current IP ranges from official vendor sources and updates
 * packages/classifier/data/ip-ranges.json.
 *
 * Usage: node scripts/refresh-ip-ranges.mjs
 *
 * Validation rules:
 *   - Each CIDR must be a valid IPv4 or IPv6 CIDR string.
 *   - Each vendor must have at least 1 CIDR.
 *   - Total CIDR count per vendor must not shrink by more than 50% in one refresh.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'packages', 'classifier', 'data', 'ip-ranges.json');

const IPV4_CIDR = /^(\d{1,3}\.){3}\d{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$/;
const IPV6_CIDR = /^[0-9a-fA-F:]+\/([0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$/;

function isValidCidr(cidr) {
  return IPV4_CIDR.test(cidr) || IPV6_CIDR.test(cidr);
}

function validateCidrs(vendorName, cidrs, previousCount) {
  if (!Array.isArray(cidrs) || cidrs.length === 0) {
    throw new Error(`${vendorName}: CIDR list is empty or not an array`);
  }
  for (const cidr of cidrs) {
    if (!isValidCidr(cidr)) {
      throw new Error(`${vendorName}: invalid CIDR format: ${cidr}`);
    }
  }
  if (previousCount > 0 && cidrs.length < previousCount * 0.5) {
    throw new Error(
      `${vendorName}: CIDR count dropped from ${previousCount} to ${cidrs.length} (>50% reduction). Refusing update.`
    );
  }
}

async function fetchJson(url, vendorName) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      console.warn(`[warn] ${vendorName}: HTTP ${resp.status} from ${url}`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.warn(`[warn] ${vendorName}: fetch failed: ${err.message}`);
    return null;
  }
}

async function main() {
  const existing = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  const fetchedAt = new Date().toISOString().slice(0, 10);
  let anyUpdated = false;

  const openAiData = await fetchJson('https://openai.com/gptbot.json', 'OpenAI');
  if (openAiData && openAiData.prefixes) {
    const cidrs = openAiData.prefixes
      .map(p => p.ipv4Prefix || p.ipv6Prefix)
      .filter(Boolean);
    const prev = existing.vendors.OpenAI?.cidrs?.length || 0;
    validateCidrs('OpenAI', cidrs, prev);
    existing.vendors.OpenAI.cidrs = cidrs;
    existing.vendors.OpenAI.fetchedAt = fetchedAt;
    console.log(`[ok] OpenAI: ${cidrs.length} CIDRs`);
    anyUpdated = true;
  }

  const anthropicData = await fetchJson('https://www.anthropic.com/claudebot.json', 'Anthropic');
  if (anthropicData) {
    let cidrs = [];
    if (Array.isArray(anthropicData.prefixes)) {
      cidrs = anthropicData.prefixes.map(p => p.ipv4Prefix || p.ipv6Prefix).filter(Boolean);
    } else if (Array.isArray(anthropicData.cidrs)) {
      cidrs = anthropicData.cidrs;
    }
    if (cidrs.length > 0) {
      const prev = existing.vendors.Anthropic?.cidrs?.length || 0;
      validateCidrs('Anthropic', cidrs, prev);
      existing.vendors.Anthropic.cidrs = cidrs;
      existing.vendors.Anthropic.fetchedAt = fetchedAt;
      console.log(`[ok] Anthropic: ${cidrs.length} CIDRs`);
      anyUpdated = true;
    }
  }

  const googleData = await fetchJson(
    'https://developers.google.com/search/apis/ipranges/googlebot.json',
    'Google'
  );
  if (googleData && googleData.prefixes) {
    const cidrs = googleData.prefixes
      .map(p => p.ipv4Prefix || p.ipv6Prefix)
      .filter(Boolean);
    const prev = existing.vendors.Google?.cidrs?.length || 0;
    validateCidrs('Google', cidrs, prev);
    existing.vendors.Google.cidrs = cidrs;
    existing.vendors.Google.fetchedAt = fetchedAt;
    console.log(`[ok] Google: ${cidrs.length} CIDRs`);
    anyUpdated = true;
  }

  const msData = await fetchJson('https://www.bing.com/toolbox/bingbot.json', 'Microsoft');
  if (msData && msData.prefixes) {
    const cidrs = msData.prefixes
      .map(p => p.ipv4Prefix || p.ipv6Prefix)
      .filter(Boolean);
    const prev = existing.vendors.Microsoft?.cidrs?.length || 0;
    validateCidrs('Microsoft', cidrs, prev);
    existing.vendors.Microsoft.cidrs = cidrs;
    existing.vendors.Microsoft.fetchedAt = fetchedAt;
    console.log(`[ok] Microsoft: ${cidrs.length} CIDRs`);
    anyUpdated = true;
  }

  console.log('[info] Perplexity: skipped (no official endpoint confirmed). Update manually.');

  if (anyUpdated) {
    writeFileSync(DATA_PATH, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
    console.log(`[ok] Written to ${DATA_PATH}`);
  } else {
    console.log('[info] No updates applied.');
  }
}

main().catch(err => {
  console.error('[error]', err.message);
  process.exit(1);
});
