import { NextRequest, NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';
import { verifyAdminAuth } from '@/lib/auth';

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
      sites,
      selectedSite: targetSite,
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

    const isDemo = body.isDemo === true;
    const site = await dbStore.getOrCreateSite(body.domain, body.name, isDemo);

    return NextResponse.json({ success: true, site }, { status: 201 });
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
