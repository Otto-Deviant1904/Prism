import { NextResponse } from 'next/server';
import { prisma } from '@vogue/db';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { analyzeProductImage, isMockMode, type VisionResult } from '@vogue/vision';
import { getEnv } from '@vogue/shared/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

const env = getEnv();
let scrapeQueue: Queue | null = null;
let redis: IORedis | null = null;

function getRedis(): IORedis {
  if (redis) return redis;
  redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return redis;
}

function getQueue(): Queue {
  if (scrapeQueue) return scrapeQueue;
  scrapeQueue = new Queue('scrape-tasks', { connection: getRedis() });
  return scrapeQueue;
}

if (isMockMode()) {
  console.log('[VISION] Running in mock mode — set GEMINI_API_KEY to enable');
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('image');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Invalid image', details: 'No image file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid image', details: `Unsupported type "${file.type}". Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Invalid image', details: `Image too large (${Math.round((file.size / 1024 / 1024) * 10) / 10}MB). Max: 5MB` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';

    const visionResult: VisionResult = await analyzeProductImage(base64, mimeType);
    const mockMode = isMockMode() || visionResult.confidence === 0;
    const query = visionResult.query;

    if (!query) {
      return NextResponse.json({ error: 'Could not generate search query from image', details: 'Vision analysis returned empty query' }, { status: 422 });
    }

    const job = await prisma.searchJob.upsert({
      where: { query },
      update: { status: 'PENDING', updatedAt: new Date() },
      create: { query, status: 'PENDING' },
    });

    await getQueue().add('scrape-search', { query, jobId: job.id }, { attempts: 3, backoff: { type: 'exponential', delay: 1500 } });

    return NextResponse.json({
      query,
      attributes: visionResult.attributes,
      confidence: visionResult.confidence,
      mockMode,
      jobId: job.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Image search failed', details: message }, { status: 500 });
  }
}
