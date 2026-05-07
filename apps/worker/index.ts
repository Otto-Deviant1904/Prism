import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@vogue/db';
import {
  AjioScraper,
  AmazonScraper,
  FlipkartScraper,
  HMIndiaScraper,
  MyntraScraper,
  NykaaFashionScraper,
  NykaaScraper,
  PurplleScraper,
  RelianceTrendsScraper,
  SavanaScraper,
  SephoraIndiaScraper,
  TataCliqScraper,
  TiraScraper
} from '@vogue/scrapers';
import {
  classifyFailure,
  normalizeTitle,
  scoreMatch,
  slugifyProduct,
  type MatchDebug,
  type RawOffer,
  type Store,
  type StoreStatus
} from '@vogue/shared';
import { getEnv } from '@vogue/shared/env';

const env = getEnv();

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const queueName = 'scrape-tasks';
const failedQueueName = 'scrape-tasks-failed';
const confidenceAccept = Number(process.env.MATCH_CONFIDENCE_ACCEPT ?? 0.72);
const confidenceReject = Number(process.env.MATCH_CONFIDENCE_REJECT ?? 0.45);

const scrapeQueue = new Queue(queueName, { connection });
const failedQueue = new Queue(failedQueueName, { connection });

const scrapers = [
  new NykaaScraper(),
  new AmazonScraper(),
  new TiraScraper(),
  new MyntraScraper(),
  new AjioScraper(),
  new FlipkartScraper(),
  new SavanaScraper(),
  new SephoraIndiaScraper(),
  new PurplleScraper(),
  new TataCliqScraper(),
  new RelianceTrendsScraper(),
  new HMIndiaScraper(),
  new NykaaFashionScraper()
];

type StoreRun = {
  store: Store;
  status: StoreStatus;
  reason: string | null;
  offers: RawOffer[];
  durationMs: number;
  usedCacheFallback: boolean;
};

function log(event: string, payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...payload }));
}

async function recordRejectedMatch(offer: {
  store: Store;
  externalId: string;
  rawTitle: string;
  normalizedTitle: string;
}, matchDebug: MatchDebug, candidate?: { id: string; name: string }): Promise<void> {
  await prisma.rejectedMatch.upsert({
    where: {
      store_externalId_normalizedTitle: {
        store: offer.store,
        externalId: offer.externalId,
        normalizedTitle: offer.normalizedTitle
      }
    },
    update: {
      confidence: matchDebug.score,
      breakdown: matchDebug.breakdown,
      reasons: matchDebug.reasons,
      candidateProductId: candidate?.id,
      candidateProductName: candidate?.name
    },
    create: {
      store: offer.store,
      externalId: offer.externalId,
      rawTitle: offer.rawTitle,
      normalizedTitle: offer.normalizedTitle,
      confidence: matchDebug.score,
      breakdown: matchDebug.breakdown,
      reasons: matchDebug.reasons,
      candidateProductId: candidate?.id,
      candidateProductName: candidate?.name
    }
  });
}

async function getCachedOffersForStore(store: Store, query: string): Promise<RawOffer[]> {
  const staleThreshold = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3);
  const rows = await prisma.offer.findMany({
    where: {
      store,
      lastScraped: { gte: staleThreshold },
      rawTitle: { contains: query, mode: 'insensitive' }
    },
    orderBy: { lastScraped: 'desc' },
    take: 12
  });

  return rows.map((offer) => ({
    store: offer.store,
    externalId: offer.externalId,
    rawTitle: offer.rawTitle,
    normalizedTitle: offer.normalizedTitle,
    price: offer.price,
    mrp: offer.mrp ?? undefined,
    url: offer.url,
    imageUrl: offer.imageUrl ?? '',
    inStock: offer.inStock,
    scrapedAt: offer.lastScraped.toISOString(),
    meta: { cached: true }
  }));
}

const worker = new Worker(
  queueName,
  async (job: Job) => {
    const { query, jobId } = job.data as { query: string; jobId: string };
    const startedAt = Date.now();

    await prisma.searchJob.update({ where: { id: jobId }, data: { status: 'PROCESSING' } });

    try {
      const storeRuns: StoreRun[] = [];
      for (const scraper of scrapers) {
        const runStart = Date.now();
        try {
          const offers = await scraper.search(query);
          if (offers.length === 0) {
            const fallback = await getCachedOffersForStore(scraper.store, query);
            storeRuns.push({
              store: scraper.store,
              status: fallback.length > 0 ? 'DEGRADED' : 'NO_RESULTS',
              reason: fallback.length > 0 ? 'NO_PRODUCT_PAYLOAD' : 'NO_RESULTS',
              offers: fallback,
              durationMs: Date.now() - runStart,
              usedCacheFallback: fallback.length > 0
            });
          } else {
            storeRuns.push({
              store: scraper.store,
              status: 'OK',
              reason: null,
              offers,
              durationMs: Date.now() - runStart,
              usedCacheFallback: false
            });
          }
        } catch (error) {
          const classified = classifyFailure(String(error));
          const fallback = await getCachedOffersForStore(scraper.store, query);
          storeRuns.push({
            store: scraper.store,
            status: fallback.length > 0 ? 'DEGRADED' : classified.status,
            reason: classified.reason,
            offers: fallback,
            durationMs: Date.now() - runStart,
            usedCacheFallback: fallback.length > 0
          });
        }
      }

      for (const run of storeRuns) {
        log('store.scrape.result', {
          query,
          store: run.store,
          status: run.status,
          reason: run.reason,
          resultCount: run.offers.length,
          durationMs: run.durationMs,
          usedCacheFallback: run.usedCacheFallback
        });
        await prisma.searchEvent.create({
          data: {
            query,
            normalizedQuery: query,
            eventType: 'STORE_SCRAPE_RESULT',
            status: run.status,
            store: run.store,
            resultCount: run.offers.length,
            latencyMs: run.durationMs,
            meta: { reason: run.reason, usedCacheFallback: run.usedCacheFallback }
          }
        });
      }

      const offers = storeRuns.flatMap((run) => run.offers);
      const touchedProductIds = new Set<string>();

      for (const offer of offers) {
        const normalized = normalizeTitle(offer.rawTitle);
        const slug = slugifyProduct(normalized);

        const candidate = await prisma.product.findFirst({
          where: {
            brand: normalized.brand,
            OR: [{ slug }, { name: { contains: normalized.name, mode: 'insensitive' } }]
          }
        });

        let productId: string;
        let matchDebug: MatchDebug | undefined;

        if (candidate) {
          matchDebug = scoreMatch(offer.rawTitle, {
            brand: candidate.brand,
            name: candidate.name,
            volume: candidate.volume,
            shade: candidate.shade
          });

          log('matching.evaluated', {
            offer: `${offer.store}:${offer.externalId}`,
            candidateProductId: candidate.id,
            score: matchDebug.score,
            breakdown: matchDebug.breakdown,
            reasons: matchDebug.reasons
          });

          if (matchDebug.score < confidenceReject) {
            await recordRejectedMatch(offer, matchDebug, { id: candidate.id, name: candidate.name });
            continue;
          }

          if (matchDebug.score < confidenceAccept) {
            await recordRejectedMatch(offer, matchDebug, { id: candidate.id, name: candidate.name });
          }

          const product = await prisma.product.update({
            where: { id: candidate.id },
            data: {
              imageUrl: candidate.imageUrl || offer.imageUrl,
              volume: candidate.volume || normalized.volume,
              shade: candidate.shade || normalized.shade
            }
          });
          productId = product.id;
        } else {
          const product = await prisma.product.create({
            data: {
              slug,
              brand: normalized.brand,
              name: normalized.name,
              volume: normalized.volume,
              shade: normalized.shade,
              category: normalized.category,
              imageUrl: offer.imageUrl
            }
          });
          productId = product.id;
        }

        touchedProductIds.add(productId);

        await prisma.offer.upsert({
          where: { store_externalId: { store: offer.store, externalId: offer.externalId } },
          update: {
            price: offer.price,
            mrp: offer.mrp,
            inStock: offer.inStock,
            lastScraped: new Date(),
            url: offer.url,
            imageUrl: offer.imageUrl,
            rawTitle: offer.rawTitle,
            normalizedTitle: offer.normalizedTitle,
            productId
          },
          create: {
            productId,
            store: offer.store,
            externalId: offer.externalId,
            url: offer.url,
            price: offer.price,
            mrp: offer.mrp,
            imageUrl: offer.imageUrl,
            rawTitle: offer.rawTitle,
            normalizedTitle: offer.normalizedTitle,
            inStock: offer.inStock
          }
        });
      }

      await prisma.searchJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', results: Array.from(touchedProductIds) }
      });

      log('worker.job.completed', {
        jobId,
        query,
        offersProcessed: offers.length,
        productsTouched: touchedProductIds.size,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      await prisma.searchJob.update({ where: { id: jobId }, data: { status: 'FAILED' } });
      await prisma.searchEvent.create({
        data: {
          query,
          normalizedQuery: query,
          eventType: 'SEARCH_FAILED',
          status: 'FAILED',
          meta: { jobId, error: String(error) }
        }
      });
      await failedQueue.add('failed-job', { query, jobId, error: String(error) });
      log('worker.job.failed', { jobId, query, error: String(error), durationMs: Date.now() - startedAt });
      throw error;
    }
  },
  { connection, concurrency: 4 }
);

setInterval(async () => {
  const waiting = await scrapeQueue.getWaitingCount();
  const active = await scrapeQueue.getActiveCount();
  const failed = await scrapeQueue.getFailedCount();
  log('worker.heartbeat', { waiting, active, failed });
}, 30000);

worker.on('ready', () => log('worker.ready', {}));
worker.on('failed', (job, err) => log('worker.failed', { jobId: job?.id, error: String(err) }));
worker.on('completed', (job) => log('worker.completed', { jobId: job.id }));
