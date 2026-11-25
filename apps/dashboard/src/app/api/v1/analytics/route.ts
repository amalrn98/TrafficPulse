import { NextRequest, NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';
import { verifyAdminAuth } from '@/lib/auth';

/** Never return key material (even hashes) to the browser. */
function publicSite<T extends { keyHash?: string; apiKey?: string }>(site: T | null): Omit<T, 'keyHash'> | null {
  if (!site) return null;
  const { keyHash: _k, ...rest } = site;
  return rest;
}

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$|^localhost$/;

export async function GET(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'Unauthorized', message: auth.error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const requestedSiteId = searchParams.get('siteId') || undefined;
    const type = searchParams.get('type') || 'all';

    const sites = await dbStore.listSites(true);

    // Determine target site
    let targetSite = null;
    if (requestedSiteId) {
      targetSite = sites.find((s) => s.id === requestedSiteId) || (await dbStore.getSiteById(requestedSiteId));
    } else if (sites.length > 0) {
      // Prefer real site if available, otherwise first available
      targetSite = sites.find((s) => !s.isDemo) || sites[0];
    }

    const siteId = targetSite?.id;
    const isDemo = targetSite?.isDemo ?? false;

    if (type === 'overview') {
      const overview = await dbStore.getOverview(siteId, isDemo);
      return NextResponse.json(overview);
    }

    if (type === 'timeseries') {
      const timeseries = await dbStore.getTimeseries(siteId, isDemo);
      return NextResponse.json(timeseries);
    }

    if (type === 'actors') {
      const topActors = await dbStore.getTopActors(siteId, 8, isDemo);
      return NextResponse.json(topActors);
    }

    if (type === 'endpoints') {
      const topEndpoints = await dbStore.getTopEndpoints(siteId, 8, isDemo);
      return NextResponse.json(topEndpoints);
    }

    if (type === 'live') {
      const liveEvents = await dbStore.getLiveEvents(siteId, 30, isDemo);
      return NextResponse.json(liveEvents);
    }

    // Default: Aggregate all sections for dashboard
    const [overview, timeseries, topActors, topEndpoints, liveEvents] = await Promise.all([
      dbStore.getOverview(siteId, isDemo),
      dbStore.getTimeseries(siteId, isDemo),
      dbStore.getTopActors(siteId, 8, isDemo),
      dbStore.getTopEndpoints(siteId, 8, isDemo),
      dbStore.getLiveEvents(siteId, 30, isDemo),
    ]);

    return NextResponse.json({
      sites: sites.map((x) => publicSite(x)),
      selectedSite: publicSite(targetSite),
      isDemo,
      overview,
      timeseries,
      topActors,
      topEndpoints,
      liveEvents,
    });
  } catch (err: unknown) {
    console.error('Analytics query error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to retrieve analytics' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'Unauthorized', message: auth.error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    if (!body || !body.domain) {
      return NextResponse.json(
        { error: 'Missing required field: domain' },
        { status: 400 }
      );
    }

    const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';
    if (!DOMAIN_RE.test(domain)) {
      return NextResponse.json({ error: 'Invalid domain (use a bare hostname such as example.com)' }, { status: 400 });
    }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : undefined;

    const isDemo = body.isDemo === true;
    const site = await dbStore.getOrCreateSite(domain, name, isDemo);

    // apiKey is present only on first creation (shown once); keyHash is never returned.
    return NextResponse.json({ success: true, site: publicSite(site) }, { status: 201 });
  } catch (err: unknown) {
    console.error('Site creation error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to register site' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'Unauthorized', message: auth.error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('siteId');
    if (!siteId) {
      return NextResponse.json({ error: 'Missing siteId parameter' }, { status: 400 });
    }

    const res = await dbStore.deleteSiteEvents(siteId);
    return NextResponse.json({ success: true, deletedEvents: res.count });
  } catch (err: unknown) {
    console.error('Data deletion error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to delete site events' },
      { status: 500 }
    );
  }
}
