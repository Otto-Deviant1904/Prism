'use client';

import { trustColor, storeInfo, formatPrice } from '@/app/lib/utils';
import type { Offer } from '@/app/types';

type Props = {
  offer: Offer;
};

export default function OfferRow({ offer }: Props) {
  const info = storeInfo(offer.store);
  return (
    <div className="flex items-center justify-between rounded bg-[#2A2A36] px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: trustColor(info.trustScore) }} />
        <span className="text-xs text-gray-400">{info.displayName}</span>
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
}
