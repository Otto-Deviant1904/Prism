import { NextResponse } from 'next/server';
import { prisma } from '@vogue/db';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { SearchRequestSchema, StoreEnum, type Store, type StoreStatus } from '@vogue/shared';
import { getEnv, isDebugMode } from '@vogue/shared/env';
import { log, requestId } from '@/app/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let scrapeQueue: Queue | null = null;
let redis: IORedis | null = null;
const env = getEnv();

function getRedis(): IORedis {
  if (redis) return redis;
  redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true
  });
  return redis;
}

function getQueue(): Queue {
  if (scrapeQueue) return scrapeQueue;
  scrapeQueue = new Queue('scrape-tasks', { connection: getRedis() });
  return scrapeQueue;
}

function normalizeQuery(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return (
        url.pathname
          .split('/')
          .filter(Boolean)
          .pop()
          ?.replace(/[-_]/g, ' ')
          .replace(/\b(p|dp|product|products|item)\b/g, '')
          .trim() || trimmed
      );
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function cacheKeyForQuery(q: string): string {
  return `search:result:${q}`;
}

export async function POST(req: Request) {
  const rid = requestId();
  const startedAt = Date.now();
  const body = await req.json();
  const parsed = SearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    log('warn', 'api.search.invalid_payload', { rid });
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  }

  const q = normalizeQuery(parsed.data.q);
  const cache = getRedis();
  const cacheKey = cacheKeyForQuery(q);
  const cached = await cache.get(cacheKey);

  let job = await prisma.searchJob.findUnique({ where: { query: q } });
  const stale = !job || Date.now() - new Date(job.updatedAt).getTime() > 1000 * 60 * 30;

  if (stale) {
    job = await prisma.searchJob.upsert({
      where: { query: q },
      update: { status: 'PENDING', updatedAt: new Date() },
      create: { query: q, status: 'PENDING' }
    });
    await getQueue().add('scrape-search', { query: q, jobId: job.id }, { attempts: 3, backoff: { type: 'exponential', delay: 1500 } });
  }

  if (!job) {
    return NextResponse.json({ error: 'Unable to create search job' }, { status: 500 });
  }

  await prisma.searchEvent.create({
    data: {
      query: parsed.data.q,
      normalizedQuery: q,
      eventType: 'SEARCH_SUBMITTED',
      status: stale ? 'QUEUED' : 'USING_EXISTING_JOB',
      latencyMs: Date.now() - startedAt,
      meta: { cacheHit: Boolean(cached) }
    }
  });

  log('info', 'api.search.submitted', { rid, q, stale, cacheHit: Boolean(cached), latencyMs: Date.now() - startedAt });

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    normalizedQuery: q,
    cacheHit: Boolean(cached),
    cachedResults: cached ? JSON.parse(cached) : null
  });
}

export async function GET(req: Request) {
  const rid = requestId();
  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const debugMode = isDebugMode();

  if (!jobId) return NextResponse.json({ error: 'Job ID required' }, { status: 400 });

  const job = await prisma.searchJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ status: 'NOT_FOUND', results: [] }, { status: 404 });

  if (job.status !== 'COMPLETED') {
    return NextResponse.json({ status: job.status, results: [] });
  }

  const ids = (Array.isArray(job.results) ? job.results : []) as string[];
  const products = await prisma.product.findMany({
    where: { id: { in: ids.length ? ids : undefined } },
    include: { offers: true }
  });

  const staleThreshold = Date.now() - 1000 * 60 * 60 * 24;
  const storeEvents = await prisma.searchEvent.findMany({
    where: {
      query: job.query,
      eventType: 'STORE_SCRAPE_RESULT'
    },
    orderBy: { createdAt: 'desc' },
    take: 30
  });
  const storeStatusMap = new Map<Store, { status: StoreStatus; reason: string | null; usedCacheFallback: boolean }>();
  for (const ev of storeEvents) {
    if (!ev.store || storeStatusMap.has(ev.store)) continue;
    const meta = (ev.meta ?? {}) as Record<string, unknown>;
    storeStatusMap.set(ev.store, {
      status: (ev.status as StoreStatus) || 'DEGRADED',
      reason: typeof meta.reason === 'string' ? meta.reason : null,
      usedCacheFallback: Boolean(meta.usedCacheFallback)
    });
  }

  const groupedResults = products
    .map((product) => {
      const anyOffers = product.offers.filter((offer) => offer.inStock).sort((a, b) => a.price - b.price);
      const freshOffers = product.offers
        .filter((offer) => offer.inStock && new Date(offer.lastScraped).getTime() >= staleThreshold)
        .sort((a, b) => a.price - b.price);
      const effectiveOffers = freshOffers.length > 0 ? freshOffers : anyOffers.slice(0, 5);
      const bestOffer = effectiveOffers[0] ?? null;
      return {
        ...product,
        offers: effectiveOffers,
        bestOffer,
        staleOfferCount: product.offers.length - effectiveOffers.length,
        updatedMinutesAgo: bestOffer ? Math.floor((Date.now() - new Date(bestOffer.lastScraped).getTime()) / 60000) : null,
        hasStaleData: (product.offers.length - freshOffers.length) > 0
      };
    })
    .filter((p) => p.offers.length > 0)
    .sort((a, b) => (a.bestOffer?.price ?? Number.MAX_SAFE_INTEGER) - (b.bestOffer?.price ?? Number.MAX_SAFE_INTEGER));

  await getRedis().set(cacheKeyForQuery(job.query), JSON.stringify(groupedResults), 'EX', 600);

  await prisma.searchEvent.create({
    data: {
      query: job.query,
      normalizedQuery: job.query,
      eventType: groupedResults.length === 0 ? 'SEARCH_NO_RESULTS' : 'SEARCH_RESULTS_RETURNED',
      status: job.status,
      resultCount: groupedResults.length,
      latencyMs: Date.now() - startedAt
    }
  });

  log('info', 'api.search.results', { rid, query: job.query, count: groupedResults.length, latencyMs: Date.now() - startedAt });

  const stores = StoreEnum.options as Store[];
  const statusObject = Object.fromEntries(
    stores.map((store) => [store, storeStatusMap.get(store) ?? { status: 'NO_RESULTS', reason: null, usedCacheFallback: false }])
  );

  return NextResponse.json(
    {
      status: job.status,
      results: groupedResults,
      degradedMode: stores.some((store) => {
        const s = storeStatusMap.get(store as Store);
        return s && s.status !== 'OK';
      }),
      storeStatus: statusObject,
      debug: debugMode
        ? {
            cacheKey: cacheKeyForQuery(job.query),
            cacheTTLSeconds: 600,
            staleThresholdHours: 24
          }
        : undefined
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=30'
      }
    }
  );
}
