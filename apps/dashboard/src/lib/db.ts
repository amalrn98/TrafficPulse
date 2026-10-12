import { prisma } from './prisma';
import { TrafficCategory, ActorFamily, TrafficIntent, ActorType, VerificationStatus, ActivityType } from '@trafficpulse/classifier';
import crypto from 'crypto';

export interface StoredEvent {
  id: string;
  siteId: string;
  idempotencyKey?: string | null;
  timestamp: string; // ISO string
  path: string;
  method: string;
  actorType: ActorType;
  actorName?: string | null;
  activityType: ActivityType;
  verificationStatus: VerificationStatus;
  confidence: number;
  evidence?: string | null;
  trafficCategory: TrafficCategory;
  botIdentifier?: string | null;
  actorFamily?: ActorFamily | null;
  intent?: TrafficIntent | null;
  verifiedOrigin: boolean;
  userAgent: string;
  ip?: string | null;
  referer?: string | null;
  statusCode: number;
  durationMs?: number | null;
  clientHints?: any;
  isDemo: boolean;
}

export interface SiteRecord {
  id: string;
  name: string;
  domain: string;
  apiKey: string;
  isDemo: boolean;
  createdAt: string;
}

export class TrafficPulseDb {
  /**
   * Generates a cryptographically secure random API key for site authentication.
   */
  public static generateApiKey(): string {
    return `tp_live_${crypto.randomBytes(18).toString('hex')}`;
  }

  /**
   * Retrieves or creates a site record in the persistent database.
   */
  public async getOrCreateSite(domain: string, name?: string, isDemo = false): Promise<SiteRecord> {
    const cleanDomain = domain.trim().toLowerCase();
    const existing = await prisma.site.findUnique({
      where: { domain: cleanDomain },
    });

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        domain: existing.domain,
        apiKey: existing.apiKey,
        isDemo: existing.isDemo,
        createdAt: existing.createdAt.toISOString(),
      };
    }

    const created = await prisma.site.create({
      data: {
        domain: cleanDomain,
        name: name || cleanDomain,
        apiKey: TrafficPulseDb.generateApiKey(),
        isDemo,
      },
    });

    return {
      id: created.id,
      name: created.name,
      domain: created.domain,
      apiKey: created.apiKey,
      isDemo: created.isDemo,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Finds a site by its primary ID.
   */
  public async getSiteById(siteId: string): Promise<SiteRecord | null> {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });
    if (!site) return null;
    return {
      id: site.id,
      name: site.name,
      domain: site.domain,
      apiKey: site.apiKey,
      isDemo: site.isDemo,
      createdAt: site.createdAt.toISOString(),
    };
  }

  /**
   * Finds a site by its API key (used for server/middleware authentication).
   */
  public async getSiteByApiKey(apiKey: string): Promise<SiteRecord | null> {
    const site = await prisma.site.findUnique({
      where: { apiKey },
    });
    if (!site) return null;
    return {
      id: site.id,
      name: site.name,
      domain: site.domain,
      apiKey: site.apiKey,
      isDemo: site.isDemo,
      createdAt: site.createdAt.toISOString(),
    };
  }

  /**
   * Lists registered sites, optionally filtering demo sites.
   */
  public async listSites(includeDemo = true): Promise<SiteRecord[]> {
    const sites = await prisma.site.findMany({
      where: includeDemo ? undefined : { isDemo: false },
      orderBy: { createdAt: 'desc' },
    });
    return sites.map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      apiKey: s.apiKey,
      isDemo: s.isDemo,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  /**
   * Records an ingested event persistently with idempotency support.
   */
  public async recordEvent(event: Omit<StoredEvent, 'id'>): Promise<{ event: StoredEvent; isDuplicate: boolean }> {
    // If an idempotency key is supplied, check for existing event within this site
    if (event.idempotencyKey) {
      const existing = await prisma.event.findUnique({
        where: {
          siteId_idempotencyKey: {
            siteId: event.siteId,
            idempotencyKey: event.idempotencyKey,
          },
        },
      });

      if (existing) {
        return {
          event: {
            id: existing.id,
            siteId: existing.siteId,
            idempotencyKey: existing.idempotencyKey,
            timestamp: existing.timestamp.toISOString(),
            path: existing.path,
            method: existing.method,
            actorType: existing.actorType as ActorType,
            actorName: existing.actorName,
            activityType: existing.activityType as ActivityType,
            verificationStatus: existing.verificationStatus as VerificationStatus,
            confidence: existing.confidence,
            evidence: existing.evidence,
            trafficCategory: existing.trafficCategory as TrafficCategory,
            botIdentifier: existing.botIdentifier,
            actorFamily: existing.actorFamily as ActorFamily,
            intent: existing.intent as TrafficIntent,
            verifiedOrigin: existing.verifiedOrigin,
            userAgent: existing.userAgent,
            ip: existing.ip,
            referer: existing.referer,
            statusCode: existing.statusCode,
            durationMs: existing.durationMs,
            clientHints: existing.clientHints ? JSON.parse(existing.clientHints) : null,
            isDemo: existing.isDemo,
          },
          isDuplicate: true,
        };
      }
    }

    const created = await prisma.event.create({
      data: {
        siteId: event.siteId,
        idempotencyKey: event.idempotencyKey || null,
        timestamp: new Date(event.timestamp),
        path: event.path,
        method: event.method,
        actorType: event.actorType,
        actorName: event.actorName || null,
        activityType: event.activityType,
        verificationStatus: event.verificationStatus,
        confidence: event.confidence,
        evidence: event.evidence || null,
        trafficCategory: event.trafficCategory,
        botIdentifier: event.botIdentifier || null,
        actorFamily: event.actorFamily || null,
        intent: event.intent || null,
        verifiedOrigin: event.verifiedOrigin,
        userAgent: event.userAgent,
        ip: event.ip || null,
        referer: event.referer || null,
        statusCode: event.statusCode,
        durationMs: event.durationMs || null,
        clientHints: event.clientHints ? JSON.stringify(event.clientHints) : null,
        isDemo: event.isDemo,
      },
    });

    return {
      event: {
        id: created.id,
        siteId: created.siteId,
        idempotencyKey: created.idempotencyKey,
        timestamp: created.timestamp.toISOString(),
        path: created.path,
        method: created.method,
        actorType: created.actorType as ActorType,
        actorName: created.actorName,
        activityType: created.activityType as ActivityType,
        verificationStatus: created.verificationStatus as VerificationStatus,
        confidence: created.confidence,
        evidence: created.evidence,
        trafficCategory: created.trafficCategory as TrafficCategory,
        botIdentifier: created.botIdentifier,
        actorFamily: created.actorFamily as ActorFamily,
        intent: created.intent as TrafficIntent,
        verifiedOrigin: created.verifiedOrigin,
        userAgent: created.userAgent,
        ip: created.ip,
        referer: created.referer,
        statusCode: created.statusCode,
        durationMs: created.durationMs,
        clientHints: created.clientHints ? JSON.parse(created.clientHints) : null,
        isDemo: created.isDemo,
      },
      isDuplicate: false,
    };
  }

  /**
   * Computes executive overview metrics at database level.
   */
  public async getOverview(siteId?: string, isDemo = false) {
    const where: any = { isDemo };
    if (siteId) where.siteId = siteId;

    const grouped = await prisma.event.groupBy({
      by: ['trafficCategory'],
      where,
      _count: { id: true },
    });

    const counts: Record<TrafficCategory, number> = {
      human: 0,
      llm_training: 0,
      ai_agent: 0,
      search_engine: 0,
      generic_bot: 0,
    };

    let total = 0;
    for (const item of grouped) {
      const cat = item.trafficCategory as TrafficCategory;
      if (counts[cat] !== undefined) {
        counts[cat] = item._count.id;
        total += item._count.id;
      }
    }

    const aiTotal = counts.llm_training + counts.ai_agent;
    const aiSharePct = total > 0 ? Math.round((aiTotal / total) * 100) : 0;
    const humanSharePct = total > 0 ? Math.round((counts.human / total) * 100) : 0;

    return {
      total,
      categories: counts,
      aiSharePct,
      humanSharePct,
      isDemo,
    };
  }

  /**
   * Computes top identified actors aggregated at the database level.
   */
  public async getTopActors(siteId?: string, limit = 8, isDemo = false) {
    const where: any = { isDemo };
    if (siteId) where.siteId = siteId;

    const grouped = await prisma.event.groupBy({
      by: ['botIdentifier', 'trafficCategory', 'verifiedOrigin'],
      where,
      _count: { id: true },
    });

    const actorCounts: Record<string, { count: number; category: TrafficCategory; verified: number }> = {};
    let totalEvents = 0;

    for (const item of grouped) {
      const cat = item.trafficCategory as TrafficCategory;
      const count = item._count.id;
      totalEvents += count;

      const name = item.botIdentifier || (cat === 'human' ? 'Organic Browsers' : 'Unidentified');
      if (!actorCounts[name]) {
        actorCounts[name] = { count: 0, category: cat, verified: 0 };
      }
      actorCounts[name].count += count;
      if (item.verifiedOrigin) {
        actorCounts[name].verified += count;
      }
    }

    return Object.entries(actorCounts)
      .map(([name, data]) => ({
        name,
        count: data.count,
        category: data.category,
        verified: data.verified,
        share: totalEvents > 0 ? Math.round((data.count / totalEvents) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Computes top endpoints aggregated at the database level.
   */
  public async getTopEndpoints(siteId?: string, limit = 8, isDemo = false) {
    const where: any = { isDemo };
    if (siteId) where.siteId = siteId;

    const grouped = await prisma.event.groupBy({
      by: ['path', 'trafficCategory'],
      where,
      _count: { id: true },
    });

    const pathCounts: Record<string, { total: number; ai: number; human: number }> = {};

    for (const item of grouped) {
      const p = item.path;
      const cat = item.trafficCategory as TrafficCategory;
      const count = item._count.id;

      if (!pathCounts[p]) {
        pathCounts[p] = { total: 0, ai: 0, human: 0 };
      }
      pathCounts[p].total += count;

      if (cat === 'llm_training' || cat === 'ai_agent') {
        pathCounts[p].ai += count;
      } else if (cat === 'human') {
        pathCounts[p].human += count;
      }
    }

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

  /**
   * Returns recent live events with pagination and index support.
   */
  public async getLiveEvents(siteId?: string, limit = 25, isDemo = false): Promise<StoredEvent[]> {
    const where: any = { isDemo };
    if (siteId) where.siteId = siteId;

    const events = await prisma.event.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return events.map((e) => ({
      id: e.id,
      siteId: e.siteId,
      idempotencyKey: e.idempotencyKey,
      timestamp: e.timestamp.toISOString(),
      path: e.path,
      method: e.method,
      actorType: e.actorType as ActorType,
      actorName: e.actorName,
      activityType: e.activityType as ActivityType,
      verificationStatus: e.verificationStatus as VerificationStatus,
      confidence: e.confidence,
      evidence: e.evidence,
      trafficCategory: e.trafficCategory as TrafficCategory,
      botIdentifier: e.botIdentifier,
      actorFamily: e.actorFamily as ActorFamily,
      intent: e.intent as TrafficIntent,
      verifiedOrigin: e.verifiedOrigin,
      userAgent: e.userAgent,
      ip: e.ip,
      referer: e.referer,
      statusCode: e.statusCode,
      durationMs: e.durationMs,
      clientHints: e.clientHints ? JSON.parse(e.clientHints) : null,
      isDemo: e.isDemo,
    }));
  }

  /**
   * Generates unambiguous UTC date-hour buckets for timeseries charts.
   * Eliminates single-hour cross-day merging bugs.
   */
  public async getTimeseries(siteId?: string, isDemo = false) {
    const now = Date.now();
    const windowHours = 12;
    const startTime = new Date(now - windowHours * 3600 * 1000);

    const where: any = {
      isDemo,
      timestamp: { gte: startTime },
    };
    if (siteId) where.siteId = siteId;

    // Fetch only events in the 12-hour window
    const events = await prisma.event.findMany({
      where,
      select: {
        timestamp: true,
        trafficCategory: true,
      },
    });

    // Initialize 12 hourly buckets with unambiguous UTC keys (YYYY-MM-DDTHH:00:00Z)
    const buckets: Record<
      string,
      {
        isoTimestamp: string;
        label: string;
        human: number;
        ai_agent: number;
        llm_training: number;
        search_engine: number;
        generic_bot: number;
      }
    > = {};

    for (let i = windowHours - 1; i >= 0; i--) {
      const d = new Date(now - i * 3600 * 1000);
      d.setUTCMinutes(0, 0, 0);
      const isoKey = d.toISOString();
      const label = `${d.getUTCHours().toString().padStart(2, '0')}:00 UTC`;
      buckets[isoKey] = {
        isoTimestamp: isoKey,
        label,
        human: 0,
        ai_agent: 0,
        llm_training: 0,
        search_engine: 0,
        generic_bot: 0,
      };
    }

    for (const evt of events) {
      const d = new Date(evt.timestamp);
      d.setUTCMinutes(0, 0, 0);
      const isoKey = d.toISOString();
      if (buckets[isoKey]) {
        const cat = evt.trafficCategory as TrafficCategory;
        if (buckets[isoKey][cat] !== undefined) {
          buckets[isoKey][cat]++;
        }
      }
    }

    return Object.values(buckets).map((b) => ({
      time: b.label,
      isoTimestamp: b.isoTimestamp,
      human: b.human,
      ai_agent: b.ai_agent,
      llm_training: b.llm_training,
      search_engine: b.search_engine,
      generic_bot: b.generic_bot,
    }));
  }
}

export const dbStore = new TrafficPulseDb();
