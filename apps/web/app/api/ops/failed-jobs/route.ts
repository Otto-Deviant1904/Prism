import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { assertAdminAccess } from '@/app/lib/admin-guard';
import { getEnv } from '@vogue/shared/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    assertAdminAccess(req);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const env = getEnv();
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  const queue = new Queue('scrape-tasks', { connection });
  const jobs = await queue.getFailed(0, 30);
  const rows = jobs.map((j) => ({ id: j.id, name: j.name, data: j.data, failedReason: j.failedReason, attemptsMade: j.attemptsMade }));
  await queue.close();
  await connection.quit();
  return NextResponse.json({ rows });
}
