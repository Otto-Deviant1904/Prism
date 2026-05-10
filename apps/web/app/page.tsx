'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import PhotoSearch from '@/components/PhotoSearch';

type Offer = {
  id: string;
  store: string;
  price: number;
  url: string;
  lastScraped: string;
  imageUrl?: string | null;
};

type Product = {
  id: string;
  brand: string;
  name: string;
  imageUrl?: string | null;
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
  storeStatus?: Record<string, { status: string; reason: string | null; usedCacheFallback: boolean }>;
  debug?: Record<string, unknown>;
};

type SortMode = 'price_asc' | 'best_value' | 'most_trusted';

const STORE_INFO: Record<string, { displayName: string; trustScore: number }> = {
  AMAZON: { displayName: 'Amazon', trustScore: 85 },
  FLIPKART: { displayName: 'Flipkart', trustScore: 85 },
  MYNTRA: { displayName: 'Myntra', trustScore: 88 },
  AJIO: { displayName: 'Ajio', trustScore: 82 },
  NYKAA: { displayName: 'Nykaa', trustScore: 95 },
  NYKAA_FASHION: { displayName: 'Nykaa Fashion', trustScore: 90 },
  TIRA: { displayName: 'Tira', trustScore: 90 },
  SEPHORA_INDIA: { displayName: 'Sephora', trustScore: 80 },
  PURPLLE: { displayName: 'Purplle', trustScore: 78 },
  TATACLIQ: { displayName: 'Tata CLiQ', trustScore: 75 },
  RELIANCE_TRENDS: { displayName: 'Reliance Trends', trustScore: 70 },
  MEESHO: { displayName: 'Meesho', trustScore: 65 },
  SAVANA: { displayName: 'Savana', trustScore: 60 },
  HM_INDIA: { displayName: 'H&M', trustScore: 78 },
};

const DEMO_QUERIES = ['lumi cream', 'cetaphil cleanser', 'maybelline fit me foundation'];
const SUGGESTED = ['black dress', 'moisturizer', 'red lipstick', 'kurta set'];
const RECENT_KEY = 'voguevault:recent-searches';

function trustColor(score: number): string {
  if (score >= 80) return '#22C55E';
  if (score >= 60) return '#EAB308';
  return '#EF4444';
}

function storeInfo(store: string): { displayName: string; trustScore: number } {
  return STORE_INFO[store] ?? { displayName: store.charAt(0) + store.slice(1).toLowerCase(), trustScore: 50 };
}

function formatPrice(n: number): string {
  return '\u20B9' + n.toLocaleString('en-IN');
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl bg-[#1A1A24] p-3">
      <div className="mb-3 aspect-square w-full rounded-lg bg-[#2A2A36]" />
      <div className="mb-2 h-3 w-16 rounded bg-[#2A2A36]" />
      <div className="mb-3 h-4 w-full rounded bg-[#2A2A36]" />
      <div className="mb-3 h-4 w-3/4 rounded bg-[#2A2A36]" />
      <div className="mb-3 h-6 w-20 rounded bg-[#2A2A36]" />
      <div className="h-9 w-full rounded-lg bg-[#2A2A36]" />
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [photoQueryText, setPhotoQueryText] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('price_asc');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
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
        body: JSON.stringify({ q }),
      });
      return (await res.json()) as { jobId: string; cachedResults?: Product[] | null };
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
      setSubmittedQuery(debouncedQuery);
      if (debouncedQuery) {
        const next = [debouncedQuery, ...recent.filter((r) => r !== debouncedQuery)].slice(0, 8);
        setRecent(next);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      }
    },
  });

  const statusQuery = useQuery<SearchStatusResponse>({
    queryKey: ['searchJob', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/search?jobId=${jobId}`);
      return (await res.json()) as SearchStatusResponse;
    },
    enabled: Boolean(jobId),
    refetchInterval: (q) => (q.state.data?.status === 'COMPLETED' || q.state.data?.status === 'FAILED' ? false : 1800),
  });

  const groupedResults = useMemo(
    () => (statusQuery.data?.results ?? []).map((p) => ({ ...p, offers: [...p.offers].sort((a, b) => a.price - b.price) })),
    [statusQuery.data?.results],
  );

  const isSearching = mutation.isPending || statusQuery.data?.status === 'PENDING' || statusQuery.data?.status === 'PROCESSING';

  const sortedResults = useMemo(() => {
    const items = groupedResults;
    switch (sortMode) {
      case 'price_asc':
        return [...items].sort((a, b) => (a.bestOffer?.price ?? Infinity) - (b.bestOffer?.price ?? Infinity));
      case 'best_value': {
        return [...items].sort((a, b) => {
          const aPrice = a.bestOffer?.price ?? Infinity;
          const bPrice = b.bestOffer?.price ?? Infinity;
          const aTrust = a.bestOffer ? storeInfo(a.bestOffer.store).trustScore : 0;
          const bTrust = b.bestOffer ? storeInfo(b.bestOffer.store).trustScore : 0;
          return aPrice / aTrust - bPrice / bTrust;
        });
      }
      case 'most_trusted': {
        return [...items].sort((a, b) => {
          const aTrust = a.bestOffer ? storeInfo(a.bestOffer.store).trustScore : 0;
          const bTrust = b.bestOffer ? storeInfo(b.bestOffer.store).trustScore : 0;
          return bTrust - aTrust || (a.bestOffer?.price ?? Infinity) - (b.bestOffer?.price ?? Infinity);
        });
      }
      default:
        return items;
    }
  }, [groupedResults, sortMode]);

  const currentQuery = photoQueryText ?? submittedQuery;

  const handleSearch = useCallback(() => {
    if (debouncedQuery.length >= 2) {
      setPhotoQueryText(null);
      setPhotoPreview(null);
      mutation.mutate(debouncedQuery);
    }
  }, [debouncedQuery, mutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  const handlePhotoFile = useCallback(
    (file: File) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
      if (file.size > 5 * 1024 * 1024) return;

      const reader = new FileReader();
      reader.onload = (e) => setPhotoPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      setPhotoLoading(true);
      setPhotoQueryText(null);
      setQuery('Searching by image...');

      const formData = new FormData();
      formData.append('image', file);

      fetch('/api/search/image', { method: 'POST', body: formData })
        .then((r) => r.json())
        .then((data) => {
          setPhotoQueryText(data.query);
          setQuery(data.query);
          setPhotoPreview(null);
          setPhotoLoading(false);
          if (data.jobId) {
            setJobId(data.jobId);
            setSubmittedQuery(data.query);
          }
        })
        .catch(() => {
          setPhotoPreview(null);
          setPhotoLoading(false);
          setQuery('');
        });
    },
    [],
  );

  const sortButtons: { key: SortMode; label: string }[] = [
    { key: 'price_asc', label: 'Price \u2191' },
    { key: 'best_value', label: 'Best Value' },
    { key: 'most_trusted', label: 'Most Trusted' },
  ];

  return (
    <main className="min-h-screen bg-[#0F0F14] text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            <span className="text-white">Vogue</span>
            <span className="text-[#6C3CE1]">Vault</span>
          </h1>
          <p className="mt-2 text-sm text-gray-400 sm:text-base">
            Find it cheaper. Anywhere in India.
          </p>
        </header>

        {/* Search Bar */}
        <div className="mx-auto mb-8 max-w-2xl">
          <div className="flex items-center gap-2 rounded-xl border border-[#2A2A36] bg-[#1A1A24] px-4 py-2 transition-colors focus-within:border-[#6C3CE1]">
            {photoPreview ? (
              <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-md">
                <img src={photoPreview} alt="" className="h-full w-full object-cover" />
              </div>
            ) : (
              <svg className="h-5 w-5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            <input
              className="flex-1 bg-transparent text-base text-white placeholder-gray-500 outline-none"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search product name..."
            />
            <PhotoSearch onFileSelect={handlePhotoFile} />
            <button
              onClick={handleSearch}
              disabled={(query.length < 2 || query === 'Searching by image...') && !photoLoading}
              className="rounded-lg bg-[#6C3CE1] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5B2ED1] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching
                </span>
              ) : (
                'Search'
              )}
            </button>
          </div>

          {/* Demo / Recent chips */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {DEMO_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => { setQuery(q); setDebouncedQuery(q); }}
                className="rounded-full border border-[#2A2A36] px-3 py-1 text-xs text-gray-400 transition-colors hover:border-[#6C3CE1] hover:text-[#6C3CE1]"
              >
                {q}
              </button>
            ))}
            {recent.length > 0 && recent.slice(0, 3).map((r) => (
              <button
                key={r}
                onClick={() => { setQuery(r); setDebouncedQuery(r); }}
                className="rounded-full border border-[#2A2A36] px-3 py-1 text-xs text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-300"
              >
                {r}
              </button>
            ))}
          </div>

          {/* Photo loading indicator */}
          {photoLoading && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-400">
              <svg className="h-4 w-4 animate-spin text-[#6C3CE1]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing image...
            </div>
          )}
        </div>

        {/* Store status badges */}
        {statusQuery.data?.storeStatus && debugMode && (
          <section className="mb-6 grid gap-2 sm:grid-cols-3">
            {Object.entries(statusQuery.data.storeStatus).map(([store, s]) => {
              const info = storeInfo(store);
              const dot = s.status === 'OK' ? '#22C55E' : s.status === 'BLOCKED' ? '#EF4444' : '#EAB308';
              return (
                <div key={store} className="flex items-center gap-2 rounded-lg border border-[#2A2A36] bg-[#1A1A24] px-3 py-2 text-xs text-gray-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
                  <span className="font-medium text-gray-300">{info.displayName}</span>
                  <span>{s.status}</span>
                </div>
              );
            })}
          </section>
        )}

        {statusQuery.data?.degradedMode && (
          <section className="mb-6 rounded-lg border border-[#EAB308]/20 bg-[#EAB308]/10 px-4 py-2 text-xs text-[#EAB308]">
            Some stores are temporarily unavailable. Showing best available results.
          </section>
        )}

        {/* Result count + Sort */}
        {currentQuery && sortedResults.length > 0 && (
          <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-gray-400">
              <span className="font-semibold text-white">{sortedResults.length}</span> results for &quot;{currentQuery}&quot;
            </p>
            <div className="flex gap-1.5 rounded-lg bg-[#1A1A24] p-1">
              {sortButtons.map((b) => (
                <button
                  key={b.key}
                  onClick={() => setSortMode(b.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    sortMode === b.key
                      ? 'bg-[#6C3CE1] text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Failed state */}
        {statusQuery.data?.status === 'FAILED' && (
          <section className="mb-6 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 px-4 py-3 text-center">
            <p className="text-sm text-[#EF4444]">Search failed. Please retry.</p>
            <button onClick={() => mutation.mutate(debouncedQuery)} className="mt-2 rounded bg-[#EF4444] px-4 py-1.5 text-xs font-semibold text-white">
              Retry
            </button>
          </section>
        )}

        {/* Loading skeleton */}
        {isSearching && sortedResults.length === 0 && (
          <div>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {statusQuery.data?.status === 'COMPLETED' && sortedResults.length === 0 && !isSearching && (
          <section className="mx-auto max-w-md text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1A1A24]">
              <svg className="h-8 w-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">No results found for &quot;{currentQuery}&quot;</p>
            <p className="mt-1 text-xs text-gray-500">Try searching for something else:</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); setDebouncedQuery(s); }}
                  className="rounded-full border border-[#2A2A36] px-4 py-1.5 text-xs text-gray-400 transition-colors hover:border-[#6C3CE1] hover:text-[#6C3CE1]"
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Product grid */}
        {sortedResults.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedResults.map((product) => {
              const firstOffer = product.offers[0];
              const bestOffer = product.bestOffer;
              const info = bestOffer ? storeInfo(bestOffer.store) : { displayName: '', trustScore: 50 };
              const imgSrc = product.imageUrl || firstOffer?.imageUrl;

              return (
                <article key={product.id} className="group flex flex-col rounded-xl bg-[#1A1A24] p-3 transition-colors hover:bg-[#22222E]">
                  {/* Image */}
                  <div className="mb-3 aspect-square w-full overflow-hidden rounded-lg bg-[#2A2A36]">
                    {imgSrc ? (
                      <img src={imgSrc} alt={product.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <svg className="h-10 w-10 text-[#2A2A36]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Store + trust */}
                  {bestOffer && (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trustColor(info.trustScore) }} />
                      <span className="text-xs font-medium text-gray-400">{info.displayName}</span>
                    </div>
                  )}

                  {/* Title */}
                  <h3 className="mb-1 line-clamp-2 text-sm leading-snug text-gray-200">
                    {product.brand && product.brand !== 'UNKNOWN' && product.brand !== ''
                      ? `${product.brand} ${product.name}`
                      : product.name}
                  </h3>

                  {product.volume && (
                    <p className="mb-2 text-xs text-gray-500">{product.volume}</p>
                  )}

                  {/* Spacer */}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    {bestOffer && (
                      <span className="text-xl font-bold text-[#6C3CE1]">{formatPrice(bestOffer.price)}</span>
                    )}
                    {bestOffer?.url && (
                      <a
                        href={bestOffer.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-[#6C3CE1] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#5B2ED1]"
                      >
                        View Deal
                      </a>
                    )}
                  </div>

                  {/* Other offers */}
                  {product.offers.length > 1 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">
                        {product.offers.length - 1} more offer{product.offers.length > 2 ? 's' : ''}
                      </summary>
                      <div className="mt-1 space-y-1">
                        {product.offers.slice(1).map((offer) => {
                          const oInfo = storeInfo(offer.store);
                          return (
                            <div key={offer.id} className="flex items-center justify-between rounded bg-[#2A2A36] px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: trustColor(oInfo.trustScore) }} />
                                <span className="text-xs text-gray-400">{oInfo.displayName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-200">{formatPrice(offer.price)}</span>
                                <a
                                  href={offer.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded bg-[#6C3CE1]/20 px-2 py-0.5 text-xs text-[#6C3CE1] transition-colors hover:bg-[#6C3CE1]/30"
                                >
                                  View
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {/* Debug */}
        {debugMode && statusQuery.data?.debug && (
          <section className="mt-8 rounded-xl border border-[#2A2A36] bg-[#1A1A24] p-4">
            <p className="mb-2 text-xs font-bold uppercase text-gray-500">Debug</p>
            <pre className="overflow-x-auto text-xs text-gray-400">{JSON.stringify(statusQuery.data.debug, null, 2)}</pre>
          </section>
        )}
      </div>
    </main>
  );
}
