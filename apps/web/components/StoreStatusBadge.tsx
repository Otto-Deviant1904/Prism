'use client';

import { storeInfo } from '@/app/lib/utils';

type StoreStatusEntry = {
  status: string;
  reason: string | null;
  usedCacheFallback: boolean;
};

type Props = {
  storeStatus: Record<string, StoreStatusEntry>;
  degradedMode?: boolean;
};

function statusDotColor(status: string): string {
  if (status === 'OK') return '#22C55E';
  if (status === 'BLOCKED') return '#EF4444';
  return '#EAB308';
}

export default function StoreStatusBadge({ storeStatus, degradedMode }: Props) {
  return (
    <>
      {degradedMode && (
        <section className="mb-6 rounded-lg border border-[#EAB308]/20 bg-[#EAB308]/10 px-4 py-2 text-xs text-[#EAB308]">
          Some stores are temporarily unavailable. Showing best available results.
        </section>
      )}
      <section className="mb-6 grid gap-2 sm:grid-cols-3">
        {Object.entries(storeStatus).map(([store, s]) => {
          const info = storeInfo(store);
          return (
            <div key={store} className="flex items-center gap-2 rounded-lg border border-[#2A2A36] bg-[#1A1A24] px-3 py-2 text-xs text-gray-400">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusDotColor(s.status) }} />
              <span className="font-medium text-gray-300">{info.displayName}</span>
              <span>{s.status}</span>
            </div>
          );
        })}
      </section>
    </>
  );
}
