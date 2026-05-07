import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { assertAdminAccess } from '@/app/lib/admin-guard';
import { getEnv } from '@vogue/shared/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    assertAdminAccess(req);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const env = getEnv();
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true
  });
  const queue = new Queue('scrape-tasks', { connection });

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount()
  ]);

  await queue.close();
  await connection.quit();

  return NextResponse.json({ waiting, active, completed, failed });
}
