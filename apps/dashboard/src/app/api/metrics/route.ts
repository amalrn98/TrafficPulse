import { NextRequest, NextResponse } from 'next/server';
import { verifyMetricsAuth } from '@/lib/auth';
import { metricsRegistry } from '@/lib/metrics';

export async function GET(req: NextRequest) {
  const auth = verifyMetricsAuth(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'Unauthorized', message: auth.error || 'Access to metrics requires authorization' },
      {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer realm="metrics"' },
      }
    );
  }

  const metricsText = metricsRegistry.renderPrometheus();

  return new NextResponse(metricsText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

