import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { dbStore } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/v1/admin/retention/prune
 * Triggers retention pruning of events older than RETENTION_DAYS (default 90).
 * Protected by ADMIN_API_KEY as documented in docs/SELF_HOSTING.md.
 */
export async function POST(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'Unauthorized', message: auth.error || 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    let retentionDays = parseInt(process.env.RETENTION_DAYS || '90', 10);
    if (Number.isNaN(retentionDays) || retentionDays <= 0) {
      retentionDays = 90;
    }

    const { searchParams } = new URL(req.url);
    const queryDays = searchParams.get('retentionDays');
    if (queryDays) {
      const parsed = parseInt(queryDays, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        retentionDays = parsed;
      }
    } else {
      try {
        const body = await req.json();
        if (body && typeof body.retentionDays === 'number' && body.retentionDays > 0) {
          retentionDays = Math.floor(body.retentionDays);
        }
      } catch {
        // Optional body omitted in cron curl call
      }
    }

    const res = await dbStore.pruneRetentionEvents(retentionDays);
    logger.info('Retention pruning completed', {
      retentionDays,
      deletedEvents: res.count,
    });

    return NextResponse.json({
      success: true,
      retentionDays,
      deletedEvents: res.count,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    logger.error('Retention pruning failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to prune retention events' },
      { status: 500 }
    );
  }
}
