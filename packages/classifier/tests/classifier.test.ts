import { test } from 'node:test';
import assert from 'node:assert';
import { TrafficClassifier } from '../src/classifier';

test('TrafficClassifier - Identifies LLM Training Crawlers', () => {
  const gptBot = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    ip: '20.15.240.10',
  });

  assert.strictEqual(gptBot.category, 'llm_training');
  assert.strictEqual(gptBot.botIdentifier, 'GPTBot');
  assert.strictEqual(gptBot.actorFamily, 'OpenAI');
  assert.strictEqual(gptBot.intent, 'pre_training');
  assert.strictEqual(gptBot.verifiedOrigin, true);

  const claudeBot = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    ip: '160.79.104.5',
  });

  assert.strictEqual(claudeBot.category, 'llm_training');
  assert.strictEqual(claudeBot.botIdentifier, 'ClaudeBot');
  assert.strictEqual(claudeBot.actorFamily, 'Anthropic');
});

test('TrafficClassifier - Identifies Real-Time AI Agents & RAG', () => {
  const perplexity = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  });

  assert.strictEqual(perplexity.category, 'ai_agent');
  assert.strictEqual(perplexity.botIdentifier, 'PerplexityBot');
  assert.strictEqual(perplexity.intent, 'rag_inference');

  const chatgptUser = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
  });

  assert.strictEqual(chatgptUser.category, 'ai_agent');
  assert.strictEqual(chatgptUser.actorFamily, 'OpenAI');
});

test('TrafficClassifier - Identifies Autonomous Agent Swarms', () => {
  const swarm = TrafficClassifier.classify({
    userAgent: 'LangChain-Agent/0.1 (browser-use crawler)',
    clientSignals: {
      webdriver: true,
    },
  });

  assert.strictEqual(swarm.category, 'ai_agent');
  assert.strictEqual(swarm.actorFamily, 'AutonomousAgent');
});

test('TrafficClassifier - Identifies Search Engine Bots', () => {
  const googlebot = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ip: '66.249.66.1',
  });

  assert.strictEqual(googlebot.category, 'search_engine');
  assert.strictEqual(googlebot.botIdentifier, 'Googlebot');
  assert.strictEqual(googlebot.verifiedOrigin, true);
});

test('TrafficClassifier - Identifies Scrapers and Headless Automation', () => {
  const curl = TrafficClassifier.classify({
    userAgent: 'curl/8.4.0',
  });

  assert.strictEqual(curl.category, 'generic_bot');
  assert.strictEqual(curl.botIdentifier, 'CLI-Tool');

  const python = TrafficClassifier.classify({
    userAgent: 'python-requests/2.31.0',
  });

  assert.strictEqual(python.category, 'generic_bot');
  assert.strictEqual(python.botIdentifier, 'Python-HTTP-Client');
});

test('TrafficClassifier - Identifies Organic Human Browsers', () => {
  const human = TrafficClassifier.classify({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    headers: {
      'accept-language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="128"',
    },
  });

  assert.strictEqual(human.category, 'human');
  assert.strictEqual(human.actorFamily, 'VerifiedHuman');
  assert.strictEqual(human.intent, 'user_browse');
});
