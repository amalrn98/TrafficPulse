import { NextRequest, NextResponse } from 'next/server';
import { TrafficClassifier } from '@trafficpulse/classifier';
import { dbStore } from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || !body.siteId) {
      return NextResponse.json(
        { error: 'Missing siteId in telemetry payload' },
        { status: 400, headers: corsHeaders }
      );
    }

    const ua = body.requestHeaders?.userAgent || body.userAgent || req.headers.get('user-agent') || '';
    const ip =
      body.ip ||
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '';

    // If classification is not pre-computed by edge middleware, evaluate here
    let trafficCategory = body.trafficCategory;
    let botIdentifier = body.botIdentifier;
    let verifiedOrigin = body.verifiedOrigin || false;
    let actorFamily = body.actorFamily;
    let intent = body.intent;

    if (!trafficCategory) {
      const classification = TrafficClassifier.classify({
        userAgent: ua,
        ip,
        method: body.method || 'GET',
        path: body.path || '/',
        clientSignals: body.clientSignals,
      });

      trafficCategory = classification.category;
      botIdentifier = classification.botIdentifier;
      verifiedOrigin = classification.verifiedOrigin;
      actorFamily = classification.actorFamily;
      intent = classification.intent;
    }

    const event = dbStore.recordEvent({
      siteId: body.siteId,
      timestamp: body.timestamp || new Date().toISOString(),
      path: body.path || '/',
      method: body.method || 'GET',
      trafficCategory,
      botIdentifier,
      actorFamily,
      intent,
      verifiedOrigin,
      userAgent: ua,
      ip,
      referer: body.requestHeaders?.referer,
      statusCode: body.statusCode || 200,
      durationMs: body.durationMs,
      clientHints: body.clientSignals,
    });

    return NextResponse.json(
      { success: true, eventId: event.id, category: trafficCategory },
      { status: 201, headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to process event payload', details: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
