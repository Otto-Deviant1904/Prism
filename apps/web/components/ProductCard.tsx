'use client';

import { trustColor, storeInfo, formatPrice } from '@/app/lib/utils';
import OfferRow from '@/components/OfferRow';
import type { Product } from '@/app/types';

type Props = {
  product: Product;
};

export default function ProductCard({ product }: Props) {
  const firstOffer = product.offers[0];
  const bestOffer = product.bestOffer;
  const info = bestOffer ? storeInfo(bestOffer.store) : { displayName: '', trustScore: 50 };
  const imgSrc = product.imageUrl ?? firstOffer?.imageUrl;

  return (
    <article className="group flex flex-col rounded-xl bg-[#1A1A24] p-3 transition-colors hover:bg-[#22222E]">
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

      {/* Price + CTA */}
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
            {product.offers.slice(1).map((offer) => (
              <OfferRow key={offer.id} offer={offer} />
            ))}
          </div>
        </details>
      )}
    </article>
  );
}
