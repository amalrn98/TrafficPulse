import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED !== 'true') {
    console.error('Refusing to seed demo data in production environment. Set FORCE_SEED=true to override.');
    process.exit(1);
  }

  console.log('Seeding TrafficPulse demo sandbox data...');

  const demoDomain = 'demo.trafficpulse.io';
  const rawDemoKey = 'tp_demo_key_9999999999999999';
  const keyHash = crypto.createHash('sha256').update(rawDemoKey).digest('hex');

  const demoSite = await prisma.site.upsert({
    where: { domain: demoDomain },
    update: { isDemo: true, keyHash },
    create: {
      id: 'site_demo_sandbox',
      name: 'Interactive Demo Sandbox',
      domain: demoDomain,
      apiKey: rawDemoKey,
      keyHash,
      isDemo: true,
    },
  });

  console.log(`Demo site ready: ${demoSite.name} (ID: ${demoSite.id}, isDemo: ${demoSite.isDemo})`);

  // Clear previous demo events for clean state
  await prisma.event.deleteMany({
    where: { siteId: demoSite.id, isDemo: true },
  });

  const sampleBots = [
    {
      name: 'GPTBot',
      category: 'llm_training',
      actorType: 'ai_crawler',
      actorFamily: 'OpenAI',
      verified: true,
      ua: 'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      ip: '20.15.240.12',
    },
    {
      name: 'PerplexityBot',
      category: 'ai_agent',
      actorType: 'ai_agent',
      actorFamily: 'Perplexity',
      verified: true,
      ua: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
      ip: '198.181.160.4',
    },
    {
      name: 'ClaudeBot',
      category: 'llm_training',
      actorType: 'ai_crawler',
      actorFamily: 'Anthropic',
      verified: true,
      ua: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
      ip: '160.79.104.8',
    },
    {
      name: 'ChatGPT-User',
      category: 'ai_agent',
      actorType: 'ai_agent',
      actorFamily: 'OpenAI',
      verified: true,
      ua: 'Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
      ip: '20.171.206.5',
    },
    {
      name: 'Bytespider',
      category: 'llm_training',
      actorType: 'ai_crawler',
      actorFamily: 'ByteDance',
      verified: false,
      ua: 'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
      ip: '110.242.68.3',
    },
    {
      name: 'Googlebot',
      category: 'search_engine',
      actorType: 'search_crawler',
      actorFamily: 'Google',
      verified: true,
      ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      ip: '66.249.66.8',
    },
    {
      name: 'Autonomous-Agent-Swarm',
      category: 'ai_agent',
      actorType: 'ai_agent',
      actorFamily: 'AutonomousAgent',
      verified: false,
      ua: 'LangChain-Agent/0.2 (browser-use crawler)',
      ip: '45.33.32.156',
    },
    {
      name: 'Playwright',
      category: 'generic_bot',
      actorType: 'automation_tool',
      actorFamily: 'HeadlessBrowser',
      verified: false,
      ua: 'Mozilla/5.0 (Windows NT 10.0; HeadlessChrome/126.0)',
      ip: '194.26.29.11',
    },
    {
      name: 'Organic Browsers',
      category: 'human',
      actorType: 'human_browser',
      actorFamily: 'VerifiedHuman',
      verified: false,
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0',
      ip: '98.210.45.19',
    },
  ];

  const samplePaths = [
    '/',
    '/docs/api-reference',
    '/blog/future-of-agentic-web',
    '/pricing',
    '/research/whitepaper',
    '/docs/getting-started',
    '/about',
  ];

  const now = Date.now();
  const demoEvents = [];

  for (let i = 0; i < 250; i++) {
    const bot = sampleBots[Math.floor(Math.random() * sampleBots.length)];
    const path = samplePaths[Math.floor(Math.random() * samplePaths.length)];
    const timeOffset = Math.floor(Math.random() * 12 * 3600 * 1000);

    demoEvents.push({
      siteId: demoSite.id,
      timestamp: new Date(now - timeOffset),
      path,
      method: 'GET',
      actorType: bot.actorType,
      actorName: bot.name,
      activityType: bot.actorType === 'human_browser' ? 'page_view' : 'content_fetch',
      verificationStatus: bot.verified ? 'verified' : bot.category === 'human' ? 'inferred' : 'claimed',
      confidence: bot.verified ? 0.95 : bot.category === 'human' ? 0.85 : 0.75,
      evidence: JSON.stringify([bot.verified ? 'verified_cidr' : 'signature_matched']),
      trafficCategory: bot.category,
      botIdentifier: bot.name,
      actorFamily: bot.actorFamily,
      intent: bot.category === 'human' ? 'user_browse' : bot.category === 'llm_training' ? 'pre_training' : 'rag_inference',
      verifiedOrigin: bot.verified,
      userAgent: bot.ua,
      ip: bot.ip,
      statusCode: 200,
      durationMs: Math.floor(Math.random() * 80) + 15,
      isDemo: true,
    });
  }

  await prisma.event.createMany({
    data: demoEvents,
  });

  console.log(`Successfully seeded ${demoEvents.length} demo events (all marked isDemo=true).`);
}

main()
  .catch((e) => {
    console.error('Error during demo seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
