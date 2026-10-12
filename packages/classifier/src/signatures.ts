import { ActorFamily, TrafficCategory, TrafficIntent } from './types';

export interface BotRule {
  pattern: RegExp;
  identifier: string;
  category: TrafficCategory;
  actorFamily: ActorFamily;
  intent: TrafficIntent;
  confidence: number;
}

/**
 * Deterministic signature database mapping User-Agent tokens and patterns
 * to their respective traffic categories and intent profiles.
 */
export const BOT_RULES: BotRule[] = [
  // ==========================================
  // 1. LLM FOUNDATION MODEL TRAINING CRAWLERS
  // ==========================================
  {
    pattern: /gptbot/i,
    identifier: 'GPTBot',
    category: 'llm_training',
    actorFamily: 'OpenAI',
    intent: 'pre_training',
    confidence: 0.99,
  },
  {
    pattern: /claudebot/i,
    identifier: 'ClaudeBot',
    category: 'llm_training',
    actorFamily: 'Anthropic',
    intent: 'pre_training',
    confidence: 0.99,
  },
  {
    pattern: /anthropic-ai/i,
    identifier: 'AnthropicAI',
    category: 'llm_training',
    actorFamily: 'Anthropic',
    intent: 'pre_training',
    confidence: 0.98,
  },
  {
    pattern: /bytespider/i,
    identifier: 'Bytespider',
    category: 'llm_training',
    actorFamily: 'ByteDance',
    intent: 'pre_training',
    confidence: 0.98,
  },
  {
    pattern: /ccbot/i,
    identifier: 'CCBot',
    category: 'llm_training',
    actorFamily: 'CommonCrawl',
    intent: 'pre_training',
    confidence: 0.99,
  },
  {
    pattern: /google-extended/i,
    identifier: 'Google-Extended',
    category: 'llm_training',
    actorFamily: 'Google',
    intent: 'pre_training',
    confidence: 0.99,
  },
  {
    pattern: /meta-externalagent/i,
    identifier: 'Meta-ExternalAgent',
    category: 'llm_training',
    actorFamily: 'Meta',
    intent: 'pre_training',
    confidence: 0.98,
  },
  {
    pattern: /facebookexternalhit/i,
    identifier: 'FacebookBot',
    category: 'llm_training',
    actorFamily: 'Meta',
    intent: 'data_harvest',
    confidence: 0.95,
  },
  {
    pattern: /cohere-ai|cohere-training/i,
    identifier: 'Cohere-AI',
    category: 'llm_training',
    actorFamily: 'Cohere',
    intent: 'pre_training',
    confidence: 0.98,
  },
  {
    pattern: /amazonbot/i,
    identifier: 'Amazonbot',
    category: 'llm_training',
    actorFamily: 'Amazon',
    intent: 'pre_training',
    confidence: 0.95,
  },
  {
    pattern: /diffbot/i,
    identifier: 'Diffbot',
    category: 'llm_training',
    actorFamily: 'DeveloperTool',
    intent: 'data_harvest',
    confidence: 0.95,
  },
  {
    pattern: /timpibot/i,
    identifier: 'TimpiBot',
    category: 'llm_training',
    actorFamily: 'GenericCrawler',
    intent: 'pre_training',
    confidence: 0.95,
  },
  {
    pattern: /omgili|omgilibot/i,
    identifier: 'Omgili',
    category: 'llm_training',
    actorFamily: 'GenericCrawler',
    intent: 'data_harvest',
    confidence: 0.95,
  },
  {
    pattern: /youbot/i,
    identifier: 'YouBot',
    category: 'llm_training',
    actorFamily: 'GenericCrawler',
    intent: 'data_harvest',
    confidence: 0.95,
  },

  // ==========================================
  // 2. REAL-TIME AI AGENTS & RAG RETRIEVAL
  // ==========================================
  {
    pattern: /chatgpt-user/i,
    identifier: 'ChatGPT-User',
    category: 'ai_agent',
    actorFamily: 'OpenAI',
    intent: 'rag_inference',
    confidence: 0.99,
  },
  {
    pattern: /oai-searchbot/i,
    identifier: 'OAI-SearchBot',
    category: 'ai_agent',
    actorFamily: 'OpenAI',
    intent: 'rag_inference',
    confidence: 0.99,
  },
  {
    pattern: /perplexitybot|perplexity-search/i,
    identifier: 'PerplexityBot',
    category: 'ai_agent',
    actorFamily: 'Perplexity',
    intent: 'rag_inference',
    confidence: 0.99,
  },
  {
    pattern: /applebot-extended/i,
    identifier: 'Applebot-Extended',
    category: 'ai_agent',
    actorFamily: 'Apple',
    intent: 'rag_inference',
    confidence: 0.98,
  },
  {
    pattern: /claude-web/i,
    identifier: 'Claude-Web',
    category: 'ai_agent',
    actorFamily: 'Anthropic',
    intent: 'rag_inference',
    confidence: 0.98,
  },
  {
    pattern: /bingchat/i,
    identifier: 'BingChat',
    category: 'ai_agent',
    actorFamily: 'Microsoft',
    intent: 'rag_inference',
    confidence: 0.98,
  },
  {
    pattern: /duckassistbot/i,
    identifier: 'DuckAssistBot',
    category: 'ai_agent',
    actorFamily: 'GenericCrawler',
    intent: 'rag_inference',
    confidence: 0.95,
  },
  {
    pattern: /autogpt|langchain|crewai|browser-use|multion|llamaindex/i,
    identifier: 'Autonomous-Agent-Swarm',
    category: 'ai_agent',
    actorFamily: 'AutonomousAgent',
    intent: 'rag_inference',
    confidence: 0.96,
  },

  // ==========================================
  // 3. SEARCH ENGINE CRAWLERS
  // ==========================================
  {
    pattern: /googlebot(?!-extended)/i,
    identifier: 'Googlebot',
    category: 'search_engine',
    actorFamily: 'Google',
    intent: 'seo_index',
    confidence: 0.98,
  },
  {
    pattern: /bingbot/i,
    identifier: 'Bingbot',
    category: 'search_engine',
    actorFamily: 'Microsoft',
    intent: 'seo_index',
    confidence: 0.98,
  },
  {
    pattern: /yandexbot/i,
    identifier: 'YandexBot',
    category: 'search_engine',
    actorFamily: 'GenericCrawler',
    intent: 'seo_index',
    confidence: 0.98,
  },
  {
    pattern: /baiduspider/i,
    identifier: 'Baiduspider',
    category: 'search_engine',
    actorFamily: 'GenericCrawler',
    intent: 'seo_index',
    confidence: 0.98,
  },
  {
    pattern: /duckduckbot/i,
    identifier: 'DuckDuckBot',
    category: 'search_engine',
    actorFamily: 'GenericCrawler',
    intent: 'seo_index',
    confidence: 0.98,
  },
  {
    pattern: /applebot(?!-extended)/i,
    identifier: 'Applebot',
    category: 'search_engine',
    actorFamily: 'Apple',
    intent: 'seo_index',
    confidence: 0.98,
  },
  {
    pattern: /sogou/i,
    identifier: 'SogouSpider',
    category: 'search_engine',
    actorFamily: 'GenericCrawler',
    intent: 'seo_index',
    confidence: 0.95,
  },

  // ==========================================
  // 4. GENERIC SCRAPERS, HEADLESS AUTOMATION & LIBS
  // ==========================================
  {
    pattern: /headlesschrome/i,
    identifier: 'HeadlessChrome',
    category: 'generic_bot',
    actorFamily: 'HeadlessBrowser',
    intent: 'data_harvest',
    confidence: 0.95,
  },
  {
    pattern: /puppeteer/i,
    identifier: 'Puppeteer',
    category: 'generic_bot',
    actorFamily: 'HeadlessBrowser',
    intent: 'automated_probe',
    confidence: 0.95,
  },
  {
    pattern: /playwright/i,
    identifier: 'Playwright',
    category: 'generic_bot',
    actorFamily: 'HeadlessBrowser',
    intent: 'automated_probe',
    confidence: 0.95,
  },
  {
    pattern: /selenium/i,
    identifier: 'Selenium',
    category: 'generic_bot',
    actorFamily: 'HeadlessBrowser',
    intent: 'automated_probe',
    confidence: 0.95,
  },
  {
    pattern: /scrapy/i,
    identifier: 'Scrapy',
    category: 'generic_bot',
    actorFamily: 'GenericCrawler',
    intent: 'data_harvest',
    confidence: 0.98,
  },
  {
    pattern: /python-requests|requests\/|urllib|aiohttp|httpx/i,
    identifier: 'Python-HTTP-Client',
    category: 'generic_bot',
    actorFamily: 'DeveloperTool',
    intent: 'automated_probe',
    confidence: 0.95,
  },
  {
    pattern: /curl\/|wget\/|httpie/i,
    identifier: 'CLI-Tool',
    category: 'generic_bot',
    actorFamily: 'DeveloperTool',
    intent: 'automated_probe',
    confidence: 0.95,
  },
  {
    pattern: /go-http-client|axios|node-fetch|got\//i,
    identifier: 'Script-HTTP-Client',
    category: 'generic_bot',
    actorFamily: 'DeveloperTool',
    intent: 'automated_probe',
    confidence: 0.95,
  },
  {
    pattern: /postmanruntime/i,
    identifier: 'PostmanRuntime',
    category: 'generic_bot',
    actorFamily: 'DeveloperTool',
    intent: 'automated_probe',
    confidence: 0.95,
  },
];
