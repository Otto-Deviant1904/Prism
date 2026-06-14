'use client';

import React from 'react';
import PhotoSearch from '@/components/PhotoSearch';
import { DEMO_QUERIES } from '@/app/constants';

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  onQueryDebouncedChange: (q: string) => void;
  onSearch: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFileSelect: (file: File) => void;
  recent: string[];
  isSearchPending: boolean;
  photoPreview: string | null;
  photoLoading: boolean;
};

export default function SearchBar({
  query,
  onQueryChange,
  onQueryDebouncedChange,
  onSearch,
  onKeyDown,
  onFileSelect,
  recent,
  isSearchPending,
  photoPreview,
  photoLoading,
}: Props) {
  return (
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
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search product name..."
        />
        <PhotoSearch onFileSelect={onFileSelect} />
        <button
          onClick={onSearch}
          disabled={(query.length < 2 || query === 'Searching by image...') && !photoLoading}
          className="rounded-lg bg-[#6C3CE1] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#5B2ED1] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSearchPending ? (
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
            onClick={() => { onQueryChange(q); onQueryDebouncedChange(q); }}
            className="rounded-full border border-[#2A2A36] px-3 py-1 text-xs text-gray-400 transition-colors hover:border-[#6C3CE1] hover:text-[#6C3CE1]"
          >
            {q}
          </button>
        ))}
        {recent.length > 0 && recent.slice(0, 3).map((r) => (
          <button
            key={r}
            onClick={() => { onQueryChange(r); onQueryDebouncedChange(r); }}
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
  );
}
