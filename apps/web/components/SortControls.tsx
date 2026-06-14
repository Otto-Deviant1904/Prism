'use client';

import type { SortMode } from '@/app/types';

type SortButton = { key: SortMode; label: string };

const SORT_BUTTONS: SortButton[] = [
  { key: 'price_asc', label: 'Price ↑' },
  { key: 'best_value', label: 'Best Value' },
  { key: 'most_trusted', label: 'Most Trusted' },
];

type Props = {
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  resultCount: number;
  query: string;
};

export default function SortControls({ sortMode, onSortChange, resultCount, query }: Props) {
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <p className="text-sm text-gray-400">
        <span className="font-semibold text-white">{resultCount}</span> results for &quot;{query}&quot;
      </p>
      <div className="flex gap-1.5 rounded-lg bg-[#1A1A24] p-1">
        {SORT_BUTTONS.map((b) => (
          <button
            key={b.key}
            onClick={() => onSortChange(b.key)}
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
  );
}
