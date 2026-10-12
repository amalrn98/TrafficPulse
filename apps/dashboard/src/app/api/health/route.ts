import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Quick readiness check querying the database
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: 'ok',
        service: 'trafficpulse-dashboard',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        status: 'degraded',
        service: 'trafficpulse-dashboard',
        database: 'unavailable',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
