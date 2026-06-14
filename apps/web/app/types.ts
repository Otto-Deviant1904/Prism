export type Offer = {
  id: string;
  store: string;
  price: number;
  url: string;
  lastScraped: string;
  imageUrl?: string | null;
};

export type Product = {
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

export type SearchStatusResponse = {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NOT_FOUND';
  results: Product[];
  degradedMode?: boolean;
  storeStatus?: Record<string, { status: string; reason: string | null; usedCacheFallback: boolean }>;
  debug?: Record<string, unknown>;
};

export type SortMode = 'price_asc' | 'best_value' | 'most_trusted';

export type StoreInfo = {
  displayName: string;
  trustScore: number;
};
