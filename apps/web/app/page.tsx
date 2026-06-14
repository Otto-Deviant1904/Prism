'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import SearchBar from '@/components/SearchBar';
import ProductCard from '@/components/ProductCard';
import SkeletonCard from '@/components/SkeletonCard';
import StoreStatusBadge from '@/components/StoreStatusBadge';
import SortControls from '@/components/SortControls';
import { SUGGESTED, RECENT_KEY } from '@/app/constants';
import { storeInfo } from '@/app/lib/utils';
import type { Product, SearchStatusResponse, SortMode } from '@/app/types';

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
    setRecent(raw ? (JSON.parse(raw) as string[]) : []);
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
      if (!res.ok) throw new Error(`Search request failed: ${res.status}`);
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
      if (!res.ok) throw new Error(`Status poll failed: ${res.status}`);
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

  const sortedResults = useMemo((): Product[] => {
    const items = groupedResults;
    switch (sortMode) {
      case 'price_asc':
        return [...items].sort((a, b) => (a.bestOffer?.price ?? Infinity) - (b.bestOffer?.price ?? Infinity));
      case 'best_value':
        return [...items].sort((a, b) => {
          const aPrice = a.bestOffer?.price ?? Infinity;
          const bPrice = b.bestOffer?.price ?? Infinity;
          const aTrust = a.bestOffer ? storeInfo(a.bestOffer.store).trustScore : 0;
          const bTrust = b.bestOffer ? storeInfo(b.bestOffer.store).trustScore : 0;
          return aPrice / aTrust - bPrice / bTrust;
        });
      case 'most_trusted':
        return [...items].sort((a, b) => {
          const aTrust = a.bestOffer ? storeInfo(a.bestOffer.store).trustScore : 0;
          const bTrust = b.bestOffer ? storeInfo(b.bestOffer.store).trustScore : 0;
          return bTrust - aTrust || (a.bestOffer?.price ?? Infinity) - (b.bestOffer?.price ?? Infinity);
        });
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

  const handlePhotoFile = useCallback((file: File) => {
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
      .then((r) => { if (!r.ok) throw new Error(`Image search failed: ${r.status}`); return r.json(); })
      .then((data: { query: string; jobId?: string }) => {
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
  }, []);

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

        <SearchBar
          query={query}
          onQueryChange={setQuery}
          onQueryDebouncedChange={setDebouncedQuery}
          onSearch={handleSearch}
          onKeyDown={handleKeyDown}
          onFileSelect={handlePhotoFile}
          recent={recent}
          isSearchPending={mutation.isPending}
          photoPreview={photoPreview}
          photoLoading={photoLoading}
        />

        {/* Store status / degraded mode */}
        {statusQuery.data?.storeStatus && debugMode && (
          <StoreStatusBadge
            storeStatus={statusQuery.data.storeStatus}
            degradedMode={statusQuery.data.degradedMode}
          />
        )}

        {/* Degraded mode banner (non-debug) */}
        {statusQuery.data?.degradedMode && !debugMode && (
          <section className="mb-6 rounded-lg border border-[#EAB308]/20 bg-[#EAB308]/10 px-4 py-2 text-xs text-[#EAB308]">
            Some stores are temporarily unavailable. Showing best available results.
          </section>
        )}

        {/* Result count + Sort */}
        {currentQuery && sortedResults.length > 0 && (
          <SortControls
            sortMode={sortMode}
            onSortChange={setSortMode}
            resultCount={sortedResults.length}
            query={currentQuery}
          />
        )}

        {/* Network/API error banners */}
        {mutation.isError && (
          <section className="mb-6 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 px-4 py-3 text-center">
            <p className="text-sm text-[#EF4444]">Could not reach the search service. Check your connection.</p>
            <button onClick={() => mutation.mutate(debouncedQuery)} className="mt-2 rounded bg-[#EF4444] px-4 py-1.5 text-xs font-semibold text-white">
              Retry
            </button>
          </section>
        )}
        {statusQuery.isError && (
          <section className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
            Lost connection while waiting for results — polling paused. Refresh to try again.
          </section>
        )}

        {/* Failed state */}
        {statusQuery.data?.status === 'FAILED' && !mutation.isError && (
          <section className="mb-6 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 px-4 py-3 text-center">
            <p className="text-sm text-[#EF4444]">Search failed. Please retry.</p>
            <button onClick={() => mutation.mutate(debouncedQuery)} className="mt-2 rounded bg-[#EF4444] px-4 py-1.5 text-xs font-semibold text-white">
              Retry
            </button>
          </section>
        )}

        {/* Loading skeleton */}
        {isSearching && sortedResults.length === 0 && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
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
            {sortedResults.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
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
