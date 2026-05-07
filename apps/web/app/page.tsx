'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

type Offer = {
  id: string;
  store: string;
  price: number;
  url: string;
  lastScraped: string;
};

type Product = {
  id: string;
  brand: string;
  name: string;
  volume?: string | null;
  offers: Offer[];
  staleOfferCount?: number;
  bestOffer?: Offer | null;
  updatedMinutesAgo?: number | null;
};

type SearchStatusResponse = {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NOT_FOUND';
  results: Product[];
  degradedMode?: boolean;
  storeStatus?: Record<string, { status: 'OK' | 'DEGRADED' | 'BLOCKED' | 'NO_RESULTS'; reason: string | null; usedCacheFallback: boolean }>;
  debug?: Record<string, unknown>;
};

const DEMO_QUERIES = ['lumi cream', 'cetaphil cleanser', 'maybelline fit me foundation'];
const RECENT_KEY = 'voguevault:recent-searches';

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-rose-200 bg-white p-5">
      <div className="mb-3 h-4 w-24 rounded bg-rose-100" />
      <div className="mb-2 h-6 w-64 rounded bg-rose-100" />
      <div className="mb-4 h-4 w-20 rounded bg-rose-100" />
      <div className="space-y-2">
        <div className="h-10 rounded bg-gray-100" />
        <div className="h-10 rounded bg-gray-100" />
      </div>
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const debugMode = process.env.NEXT_PUBLIC_DEBUG_MODE === 'true';

  useEffect(() => {
    const raw = localStorage.getItem(RECENT_KEY);
    setRecent(raw ? JSON.parse(raw) : []);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const mutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q })
      });
      return (await res.json()) as { jobId: string; cachedResults?: Product[] | null };
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
      if (debouncedQuery) {
        const next = [debouncedQuery, ...recent.filter((r) => r !== debouncedQuery)].slice(0, 8);
        setRecent(next);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      }
    }
  });

  const statusQuery = useQuery<SearchStatusResponse>({
    queryKey: ['searchJob', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/search?jobId=${jobId}`);
      return (await res.json()) as SearchStatusResponse;
    },
    enabled: Boolean(jobId),
    refetchInterval: (q) => (q.state.data?.status === 'COMPLETED' || q.state.data?.status === 'FAILED' ? false : 1800)
  });

  const groupedResults = useMemo(
    () => (statusQuery.data?.results ?? []).map((p) => ({ ...p, offers: [...p.offers].sort((a, b) => a.price - b.price) })),
    [statusQuery.data?.results]
  );

  const isSearching = mutation.isPending || statusQuery.data?.status === 'PENDING' || statusQuery.data?.status === 'PROCESSING';

  async function trackStoreClick(store: Offer['store'], queryText: string): Promise<void> {
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'STORE_CLICK', store, query: queryText, normalizedQuery: queryText })
    });
  }

  async function sendFeedback(feedbackType: 'WRONG_MATCH' | 'MISSING_PRODUCT' | 'THUMBS_UP' | 'THUMBS_DOWN', productId?: string) {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackType, query: debouncedQuery, productId })
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-8 rounded-3xl border border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50 p-6 sm:p-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">VogueVault</h1>
        <p className="mt-2 text-sm text-gray-700 sm:text-base">Compare beauty prices across Nykaa, Amazon India, and Tira in one trusted view.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            className="w-full rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm shadow-sm outline-none ring-rose-300 focus:ring"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product name or paste product URL"
          />
          <button
            onClick={() => mutation.mutate(debouncedQuery)}
            disabled={debouncedQuery.length < 2 || mutation.isPending}
            className="rounded-xl bg-rose-600 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-300"
          >
            {mutation.isPending ? 'Searching...' : 'Compare Prices'}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {DEMO_QUERIES.map((q) => (
            <button key={q} onClick={() => setQuery(q)} className="rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700">
              Demo: {q}
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {recent.map((r) => (
              <button key={r} onClick={() => setQuery(r)} className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700">
                Recent: {r}
              </button>
            ))}
          </div>
        )}
      </section>

      {statusQuery.data?.storeStatus && (
        <section className="mb-5 grid gap-2 sm:grid-cols-3">
          {Object.entries(statusQuery.data.storeStatus).map(([store, s]) => {
            const tone = s?.status === 'OK' ? 'bg-green-100 text-green-800 border-green-300' : s?.status === 'BLOCKED' ? 'bg-red-100 text-red-800 border-red-300' : s?.status === 'DEGRADED' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-gray-100 text-gray-700 border-gray-300';
            return (
              <div key={store} className={`rounded-lg border px-3 py-2 text-xs ${tone}`}>
                <p className="font-bold">{store}: {s?.status ?? 'NO_RESULTS'}</p>
                <p>{s?.usedCacheFallback ? 'using cached fallback' : s?.reason ?? 'live'}</p>
              </div>
            );
          })}
        </section>
      )}

      {statusQuery.data?.degradedMode && (
        <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Some stores are temporarily unavailable. Showing best available results with cached/stale fallback where possible.
        </section>
      )}

      {isSearching && (
        <section className="space-y-4">
          <p className="text-sm text-gray-600">Searching stores and validating matches...</p>
          <SkeletonCard />
          <SkeletonCard />
        </section>
      )}

      {statusQuery.data?.status === 'FAILED' && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">Search failed. Please retry.</p>
          <button onClick={() => mutation.mutate(debouncedQuery)} className="mt-2 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white">
            Retry Search
          </button>
        </section>
      )}

      {statusQuery.data?.status === 'COMPLETED' && groupedResults.length === 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-800">No reliable matches found. We avoid showing uncertain comparisons.</p>
          <button onClick={() => sendFeedback('MISSING_PRODUCT')} className="mt-3 rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white">
            Report Missing Product
          </button>
        </section>
      )}

      {groupedResults.length > 0 && (
        <section className="space-y-5">
          {groupedResults.map((product) => (
            <article key={product.id} className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-600">{product.brand}</p>
                  <h2 className="text-lg font-bold text-gray-900 sm:text-xl">{product.name}</h2>
                  <p className="text-xs text-gray-500">{product.volume ?? 'Size not specified'} · updated {product.updatedMinutesAgo ?? '-'} mins ago</p>
                  {product.staleOfferCount ? <p className="text-xs text-amber-700">Includes cached/stale store data</p> : null}
                </div>
                {product.bestOffer && <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Best Price ₹{product.bestOffer.price}</span>}
              </div>

              {product.staleOfferCount ? <p className="mb-2 text-xs text-amber-700">{product.staleOfferCount} stale offers hidden</p> : null}

              <div className="space-y-2">
                {product.offers.map((offer, idx) => (
                  <div key={offer.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${idx === 0 ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{offer.store}</p>
                      <p className="text-xs text-gray-500">Updated {Math.max(1, Math.floor((Date.now() - new Date(offer.lastScraped).getTime()) / 60000))} mins ago</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold text-gray-900">₹{offer.price}</p>
                      <a
                        href={offer.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => trackStoreClick(offer.store, debouncedQuery)}
                        className="rounded bg-black px-3 py-1 text-xs font-semibold text-white"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => sendFeedback('THUMBS_UP', product.id)} className="rounded border border-green-300 px-3 py-1 text-xs text-green-700">
                  👍 Helpful
                </button>
                <button onClick={() => sendFeedback('THUMBS_DOWN', product.id)} className="rounded border border-red-300 px-3 py-1 text-xs text-red-700">
                  👎 Not helpful
                </button>
                <button onClick={() => sendFeedback('WRONG_MATCH', product.id)} className="rounded border border-amber-300 px-3 py-1 text-xs text-amber-700">
                  Report Wrong Match
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {debugMode && statusQuery.data?.debug && (
        <section className="mt-8 rounded-xl border border-gray-300 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase text-gray-700">Debug Mode</p>
          <pre className="overflow-x-auto text-xs text-gray-700">{JSON.stringify(statusQuery.data.debug, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
