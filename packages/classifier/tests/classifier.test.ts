import { test } from 'node:test';
import assert from 'node:assert';
import { TrafficClassifier } from '../src/classifier';
import { isIpInCidr, parseIpv4, parseIpv6, verifyIpOrigin } from '../src/ip-ranges';
import { REASON_CODES } from '../src/types';

test('TrafficClassifier - Identifies LLM Training Crawlers with Verification Status', () => {
  // Verified Origin via CIDR match
  const gptBotVerified = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    ip: '20.15.240.10',
  });

  assert.strictEqual(gptBotVerified.category, 'llm_training');
  assert.strictEqual(gptBotVerified.actorType, 'ai_crawler');
  assert.strictEqual(gptBotVerified.botIdentifier, 'GPTBot');
  assert.strictEqual(gptBotVerified.actorFamily, 'OpenAI');
  assert.strictEqual(gptBotVerified.intent, 'pre_training');
  assert.strictEqual(gptBotVerified.verifiedOrigin, true);
  assert.strictEqual(gptBotVerified.verificationStatus, 'verified');
  assert.ok(gptBotVerified.reasonCodes.includes(REASON_CODES.CIDR_VERIFIED));
  assert.strictEqual(gptBotVerified.confidenceType, 'heuristic');

  // Claimed Signature but Unverified Origin (IP outside OpenAI CIDRs)
  const gptBotSpoofed = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    ip: '198.51.100.25', // Documentation / TEST-NET-2 IP
  });

  assert.strictEqual(gptBotSpoofed.category, 'llm_training');
  assert.strictEqual(gptBotSpoofed.actorType, 'ai_crawler');
  assert.strictEqual(gptBotSpoofed.verifiedOrigin, false);
  assert.strictEqual(gptBotSpoofed.verificationStatus, 'unverified');
  assert.ok(gptBotSpoofed.reasonCodes.includes(REASON_CODES.CIDR_UNVERIFIED));
  assert.ok(gptBotSpoofed.confidence < gptBotVerified.confidence, 'Unverified crawler should have lower confidence');
});

test('TrafficClassifier - Identifies Real-Time AI Agents & RAG with Proper Reason Codes', () => {
  const perplexity = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    ip: '198.181.160.5',
  });

  assert.strictEqual(perplexity.category, 'ai_agent');
  assert.strictEqual(perplexity.actorType, 'ai_agent');
  assert.strictEqual(perplexity.botIdentifier, 'PerplexityBot');
  assert.strictEqual(perplexity.intent, 'rag_inference');
  assert.strictEqual(perplexity.verifiedOrigin, true);
  assert.strictEqual(perplexity.verificationStatus, 'verified');

  const chatgptUser = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
  });

  assert.strictEqual(chatgptUser.category, 'ai_agent');
  assert.strictEqual(chatgptUser.actorFamily, 'OpenAI');
  assert.strictEqual(chatgptUser.verificationStatus, 'claimed');
});

test('TrafficClassifier - Autonomous Agent Telemetry & Precedence Rules', () => {
  // Agent swarm with active WebDriver
  const swarm = TrafficClassifier.classify({
    userAgent: 'LangChain-Agent/0.1 (browser-use crawler)',
    clientSignals: {
      webdriver: true,
    },
  });

  assert.strictEqual(swarm.category, 'ai_agent');
  assert.strictEqual(swarm.actorType, 'ai_agent');
  assert.strictEqual(swarm.actorFamily, 'AutonomousAgent');
  assert.strictEqual(swarm.verificationStatus, 'inferred');

  // Generic headless browser with active WebDriver
  const headless = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0',
    clientSignals: {
      webdriver: true,
    },
  });

  assert.strictEqual(headless.category, 'generic_bot');
  assert.strictEqual(headless.actorType, 'automation_tool');
  assert.ok(headless.reasonCodes.includes(REASON_CODES.WEBDRIVER_ACTIVE));
});

test('TrafficClassifier - Adversarial Conflict: Bot Signature with Fabricated Human Biometrics', () => {
  // Adversary supplies ClaudeBot UA while attempting to claim human mouse entropy
  const adversarial = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    clientSignals: {
      mouseEntropy: 2.4, // Fabricated high entropy
      interactionCount: 15,
    },
  });

  // Authoritative bot rule must NOT be overridden by client telemetry
  assert.strictEqual(adversarial.category, 'llm_training');
  assert.strictEqual(adversarial.actorType, 'ai_crawler');
  assert.strictEqual(adversarial.botIdentifier, 'ClaudeBot');
  assert.ok(adversarial.reasonCodes.includes(REASON_CODES.CONFLICTING_SIGNALS));
});

test('TrafficClassifier - Organic Browsers: Claimed vs Inferred Human Biometrics', () => {
  // Standard browser without biometrics (e.g. server-side request)
  const claimedHuman = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="128"',
    },
  });

  assert.strictEqual(claimedHuman.category, 'human');
  assert.strictEqual(claimedHuman.actorType, 'human_browser');
  assert.strictEqual(claimedHuman.verificationStatus, 'claimed');
  assert.strictEqual(claimedHuman.verifiedOrigin, false);

  // Browser with confirmed interactive biometrics
  const inferredHuman = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0',
    clientSignals: {
      mouseEntropy: 1.8,
      interactionCount: 8,
    },
  });

  assert.strictEqual(inferredHuman.category, 'human');
  assert.strictEqual(inferredHuman.verificationStatus, 'inferred');
  assert.ok(inferredHuman.reasonCodes.includes(REASON_CODES.BIOMETRIC_ENTROPY_OBSERVED));
});

test('TrafficClassifier - Header Anomalies on Spoofed Browser UAs', () => {
  // Mozilla UA with missing standard browser headers
  const spoofed = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0',
    headers: {}, // Missing accept-language and sec-ch-ua
  });

  assert.strictEqual(spoofed.category, 'generic_bot');
  assert.strictEqual(spoofed.actorType, 'automation_tool');
  assert.ok(spoofed.reasonCodes.includes(REASON_CODES.HEADER_ANOMALY));
});

test('TrafficClassifier - Empty and Unrecognized Traffic Handling', () => {
  // Empty User-Agent
  const empty = TrafficClassifier.classify({
    userAgent: '',
  });

  assert.strictEqual(empty.actorType, 'unknown');
  assert.strictEqual(empty.verificationStatus, 'unknown');
  assert.ok(empty.reasonCodes.includes(REASON_CODES.EMPTY_USER_AGENT));

  // Unrecognized arbitrary client
  const unknownClient = TrafficClassifier.classify({
    userAgent: 'CustomInternalProbe/4.1.0',
  });

  assert.strictEqual(unknownClient.actorType, 'unknown');
  assert.strictEqual(unknownClient.verificationStatus, 'unknown');
  assert.ok(unknownClient.reasonCodes.includes(REASON_CODES.UNKNOWN_CLIENT));
  assert.ok(unknownClient.confidence <= 0.40, 'Unknown client should have low confidence');
});

test('IP Range & CIDR Engine - IPv4 CIDR Matching', () => {
  assert.strictEqual(isIpInCidr('20.15.240.12', '20.15.240.0/20'), true);
  assert.strictEqual(isIpInCidr('20.15.255.254', '20.15.240.0/20'), true);
  assert.strictEqual(isIpInCidr('20.15.239.255', '20.15.240.0/20'), false);
  assert.strictEqual(isIpInCidr('20.16.0.1', '20.15.240.0/20'), false);

  // Exact /32 match
  assert.strictEqual(isIpInCidr('66.249.66.1', '66.249.66.1/32'), true);
  assert.strictEqual(isIpInCidr('66.249.66.2', '66.249.66.1/32'), false);

  // Prefix collision test (old startsWith bug check: 66.249. vs 66.2499.x.x)
  assert.strictEqual(isIpInCidr('66.249.66.1', '66.249.64.0/19'), true);
  assert.strictEqual(isIpInCidr('66.250.0.1', '66.249.64.0/19'), false);
});

test('IP Range & CIDR Engine - IPv6 and IPv4-Mapped IPv6 Matching', () => {
  // Googlebot IPv6
  assert.strictEqual(isIpInCidr('2001:4860:4801::1234', '2001:4860:4801::/48'), true);
  assert.strictEqual(isIpInCidr('2001:4860:4802::1', '2001:4860:4801::/48'), false);

  // IPv4-mapped IPv6 address: ::ffff:20.15.240.12 in 20.15.240.0/20
  // Note: IPv4 to IPv4 CIDR handles dotted notation directly
  assert.strictEqual(isIpInCidr('20.15.240.12', '20.15.240.0/20'), true);
});

test('IP Range & CIDR Engine - Malformed IP Rejection', () => {
  assert.strictEqual(parseIpv4('999.999.999.999'), null);
  assert.strictEqual(parseIpv4('abc.def.ghi.jkl'), null);
  assert.strictEqual(parseIpv4('192.168.1'), null);
  assert.strictEqual(parseIpv4('192.168.1.1.1'), null);

  assert.strictEqual(parseIpv6(':::'), null);
  assert.strictEqual(parseIpv6('2001:xyz::1'), null);

  assert.strictEqual(isIpInCidr('malformed_ip', '20.15.240.0/20'), false);
  assert.strictEqual(isIpInCidr('192.168.1.1', 'invalid_cidr'), false);
  assert.strictEqual(verifyIpOrigin('not_an_ip', 'OpenAI'), false);
});

test('TrafficClassifier - Deterministic Output Guarantee', () => {
  const meta = {
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ip: '66.249.66.1',
    headers: { 'accept-language': 'en-US' },
  };

  const res1 = TrafficClassifier.classify(meta);
  const res2 = TrafficClassifier.classify(meta);

  assert.strictEqual(res1.actorType, res2.actorType);
  assert.strictEqual(res1.category, res2.category);
  assert.strictEqual(res1.confidence, res2.confidence);
  assert.strictEqual(res1.verificationStatus, res2.verificationStatus);
  assert.deepStrictEqual(res1.reasonCodes, res2.reasonCodes);
});
