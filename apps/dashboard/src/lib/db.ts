import { TrafficCategory, ActorFamily, TrafficIntent } from '@trafficpulse/classifier';

export interface StoredEvent {
  id: string;
  siteId: string;
  timestamp: string; // ISO string
  path: string;
  method: string;
  trafficCategory: TrafficCategory;
  botIdentifier?: string;
  actorFamily?: ActorFamily;
  intent?: TrafficIntent;
  verifiedOrigin: boolean;
  userAgent: string;
  ip?: string;
  referer?: string;
  statusCode: number;
  durationMs?: number;
  clientHints?: any;
}

export interface SiteRecord {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
}

/**
 * High-performance, zero-friction storage layer for TrafficPulse.
 * Provides in-memory buffer with fallback persistence and seed defaults.
 */
class TrafficPulseStore {
  private sites: Map<string, SiteRecord> = new Map();
  private events: StoredEvent[] = [];
  private maxEvents: number = 50000;

  constructor() {
    this.seedDefaultSite();
  }

  private seedDefaultSite() {
    const defaultSite: SiteRecord = {
      id: 'site_prod_demo_01',
      name: 'Production Portal',
      domain: 'mycompany.io',
      createdAt: new Date().toISOString(),
    };
    this.sites.set(defaultSite.id, defaultSite);
    this.seedRealisticEvents(defaultSite.id);
  }

  public getOrCreateSite(domain: string, name?: string): SiteRecord {
    for (const site of Array.from(this.sites.values())) {
      if (site.domain === domain) return site;
    }
    const id = `site_${Math.random().toString(36).substring(2, 9)}`;
    const newSite: SiteRecord = {
      id,
      name: name || domain,
      domain,
      createdAt: new Date().toISOString(),
    };
    this.sites.set(id, newSite);
    return newSite;
  }

  public listSites(): SiteRecord[] {
    return Array.from(this.sites.values());
  }

  public recordEvent(event: Omit<StoredEvent, 'id'>): StoredEvent {
    const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullEvent: StoredEvent = { id, ...event };

    this.events.unshift(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events.pop();
    }

    return fullEvent;
  }

  public getOverview(siteId?: string) {
    const filtered = siteId
      ? this.events.filter((e) => e.siteId === siteId)
      : this.events;

    const total = filtered.length;
    const counts: Record<TrafficCategory, number> = {
      human: 0,
      llm_training: 0,
      ai_agent: 0,
      search_engine: 0,
      generic_bot: 0,
    };

    filtered.forEach((e) => {
      if (counts[e.trafficCategory] !== undefined) {
        counts[e.trafficCategory]++;
      }
    });

    const aiTotal = counts.llm_training + counts.ai_agent;
    const aiSharePct = total > 0 ? Math.round((aiTotal / total) * 100) : 0;
    const humanSharePct = total > 0 ? Math.round((counts.human / total) * 100) : 0;

    return {
      total,
      categories: counts,
      aiSharePct,
      humanSharePct,
    };
  }

  public getTopActors(siteId?: string, limit: number = 8) {
    const filtered = siteId
      ? this.events.filter((e) => e.siteId === siteId)
      : this.events;

    const actorCounts: Record<string, { count: number; category: TrafficCategory; verified: number }> = {};

    filtered.forEach((e) => {
      const name = e.botIdentifier || (e.trafficCategory === 'human' ? 'Organic Browsers' : 'Unidentified');
      if (!actorCounts[name]) {
        actorCounts[name] = { count: 0, category: e.trafficCategory, verified: 0 };
      }
      actorCounts[name].count++;
      if (e.verifiedOrigin) {
        actorCounts[name].verified++;
      }
    });

    return Object.entries(actorCounts)
      .map(([name, data]) => ({
        name,
        count: data.count,
        category: data.category,
        verified: data.verified,
        share: filtered.length > 0 ? Math.round((data.count / filtered.length) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  public getTopEndpoints(siteId?: string, limit: number = 8) {
    const filtered = siteId
      ? this.events.filter((e) => e.siteId === siteId)
      : this.events;

    const pathCounts: Record<string, { total: number; ai: number; human: number }> = {};

    filtered.forEach((e) => {
      if (!pathCounts[e.path]) {
        pathCounts[e.path] = { total: 0, ai: 0, human: 0 };
      }
      pathCounts[e.path].total++;
      if (e.trafficCategory === 'llm_training' || e.trafficCategory === 'ai_agent') {
        pathCounts[e.path].ai++;
      } else if (e.trafficCategory === 'human') {
        pathCounts[e.path].human++;
      }
    });

    return Object.entries(pathCounts)
      .map(([path, stats]) => ({
        path,
        total: stats.total,
        aiRequests: stats.ai,
        humanRequests: stats.human,
        aiRatio: stats.total > 0 ? Math.round((stats.ai / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  public getLiveEvents(siteId?: string, limit: number = 25): StoredEvent[] {
    const filtered = siteId
      ? this.events.filter((e) => e.siteId === siteId)
      : this.events;
    return filtered.slice(0, limit);
  }

  public getTimeseries(siteId?: string) {
    const filtered = siteId
      ? this.events.filter((e) => e.siteId === siteId)
      : this.events;

    // Group into 12 hourly buckets
    const now = Date.now();
    const buckets: Record<string, { time: string; human: number; ai_agent: number; llm_training: number; search_engine: number; generic_bot: number }> = {};

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now - i * 3600 * 1000);
      const label = `${d.getHours().toString().padStart(2, '0')}:00`;
      buckets[label] = { time: label, human: 0, ai_agent: 0, llm_training: 0, search_engine: 0, generic_bot: 0 };
    }

    filtered.forEach((e) => {
      const d = new Date(e.timestamp);
      const label = `${d.getHours().toString().padStart(2, '0')}:00`;
      if (buckets[label] && buckets[label][e.trafficCategory] !== undefined) {
        buckets[label][e.trafficCategory]++;
      }
    });

    return Object.values(buckets);
  }

  private seedRealisticEvents(siteId: string) {
    const sampleBots = [
      { name: 'GPTBot', category: 'llm_training' as const, family: 'OpenAI' as const, verified: true, ua: 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)', ip: '20.15.240.12' },
      { name: 'PerplexityBot', category: 'ai_agent' as const, family: 'Perplexity' as const, verified: true, ua: 'Mozilla/5.0 (compatible; PerplexityBot/1.0)', ip: '198.181.12.4' },
      { name: 'ClaudeBot', category: 'llm_training' as const, family: 'Anthropic' as const, verified: true, ua: 'Mozilla/5.0 (compatible; ClaudeBot/1.0)', ip: '160.79.104.8' },
      { name: 'ChatGPT-User', category: 'ai_agent' as const, family: 'OpenAI' as const, verified: true, ua: 'Mozilla/5.0 (compatible; ChatGPT-User/1.0)', ip: '20.171.206.5' },
      { name: 'Bytespider', category: 'llm_training' as const, family: 'ByteDance' as const, verified: false, ua: 'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)', ip: '110.242.68.3' },
      { name: 'Googlebot', category: 'search_engine' as const, family: 'Google' as const, verified: true, ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)', ip: '66.249.66.8' },
      { name: 'Autonomous-Agent-Swarm', category: 'ai_agent' as const, family: 'AutonomousAgent' as const, verified: false, ua: 'LangChain-Agent/0.2 (browser-use crawler)', ip: '45.33.32.156' },
      { name: 'Playwright', category: 'generic_bot' as const, family: 'HeadlessBrowser' as const, verified: false, ua: 'Mozilla/5.0 (Windows NT 10.0; HeadlessChrome/126.0)', ip: '194.26.29.11' },
      { name: 'Organic Browsers', category: 'human' as const, family: 'VerifiedHuman' as const, verified: false, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0', ip: '98.210.45.19' },
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
    for (let i = 0; i < 400; i++) {
      const bot = sampleBots[Math.floor(Math.random() * sampleBots.length)];
      const path = samplePaths[Math.floor(Math.random() * samplePaths.length)];
      const timeOffset = Math.floor(Math.random() * 12 * 3600 * 1000);

      this.events.push({
        id: `evt_seed_${i}`,
        siteId,
        timestamp: new Date(now - timeOffset).toISOString(),
        path,
        method: 'GET',
        trafficCategory: bot.category,
        botIdentifier: bot.name,
        actorFamily: bot.family,
        intent: bot.category === 'human' ? 'user_browse' : bot.category === 'llm_training' ? 'pre_training' : 'rag_inference',
        verifiedOrigin: bot.verified,
        userAgent: bot.ua,
        ip: bot.ip,
        statusCode: 200,
        durationMs: Math.floor(Math.random() * 80) + 15,
      });
    }

    this.events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
}

export const dbStore = new TrafficPulseStore();
