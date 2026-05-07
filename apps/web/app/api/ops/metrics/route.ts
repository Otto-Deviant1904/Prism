import { NextResponse } from 'next/server';
import { prisma } from '@vogue/db';
import { assertAdminAccess } from '@/app/lib/admin-guard';
import { StoreEnum } from '@vogue/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    assertAdminAccess(req);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const [totalSearches, noResultSearches, failedSearches, topQueries, ctrByStore, rejectedCount, storeRuns] = await Promise.all([
    prisma.searchEvent.count({ where: { eventType: 'SEARCH_SUBMITTED' } }),
    prisma.searchEvent.count({ where: { eventType: 'SEARCH_NO_RESULTS' } }),
    prisma.searchEvent.count({ where: { eventType: 'SEARCH_FAILED' } }),
    prisma.searchEvent.groupBy({ by: ['normalizedQuery'], _count: true, orderBy: { _count: { normalizedQuery: 'desc' } }, take: 10 }),
    prisma.searchEvent.groupBy({ by: ['store'], where: { eventType: 'STORE_CLICK' }, _count: true }),
    prisma.rejectedMatch.count({ where: { reviewStatus: 'PENDING' } }),
    prisma.searchEvent.findMany({ where: { eventType: 'STORE_SCRAPE_RESULT' }, orderBy: { createdAt: 'desc' }, take: 500 })
  ]);

  const stores = StoreEnum.options;
  const storeHealth = stores.map((store) => {
    const rows = storeRuns.filter((r) => r.store === store);
    const total = rows.length || 1;
    const ok = rows.filter((r) => r.status === 'OK').length;
    const blocked = rows.filter((r) => r.status === 'BLOCKED').length;
    const noResults = rows.filter((r) => r.status === 'NO_RESULTS').length;
    const avgMs = Math.round(rows.reduce((acc, row) => acc + (row.latencyMs || 0), 0) / total);
    const reasonCounts: Record<string, number> = {};
    for (const row of rows) {
      const meta = (row.meta ?? {}) as Record<string, unknown>;
      const reason = typeof meta.reason === 'string' ? meta.reason : 'NONE';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
    return {
      store,
      successRate: Number((ok / total).toFixed(3)),
      blockedRate: Number((blocked / total).toFixed(3)),
      zeroResultRate: Number((noResults / total).toFixed(3)),
      averageExtractionMs: avgMs,
      lastStatus: rows[0]?.status ?? 'NO_RESULTS',
      topReasons: Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    };
  });

  return NextResponse.json({
    totalSearches,
    noResultSearches,
    failedSearches,
    topQueries,
    ctrByStore,
    rejectedCount,
    storeHealth
  });
}
