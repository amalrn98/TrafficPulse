import { NextRequest, NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('siteId') || undefined;
  const type = searchParams.get('type') || 'all';

  if (type === 'overview') {
    return NextResponse.json(dbStore.getOverview(siteId));
  }

  if (type === 'timeseries') {
    return NextResponse.json(dbStore.getTimeseries(siteId));
  }

  if (type === 'actors') {
    return NextResponse.json(dbStore.getTopActors(siteId));
  }

  if (type === 'endpoints') {
    return NextResponse.json(dbStore.getTopEndpoints(siteId));
  }

  if (type === 'live') {
    return NextResponse.json(dbStore.getLiveEvents(siteId));
  }

  // Default: Return all aggregated sections
  return NextResponse.json({
    sites: dbStore.listSites(),
    overview: dbStore.getOverview(siteId),
    timeseries: dbStore.getTimeseries(siteId),
    topActors: dbStore.getTopActors(siteId),
    topEndpoints: dbStore.getTopEndpoints(siteId),
    liveEvents: dbStore.getLiveEvents(siteId, 30),
  });
}
