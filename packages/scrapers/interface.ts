import { type RawOffer, type Store } from '@vogue/shared';

export interface IScraper {
  store: Store;
  search(query: string): Promise<RawOffer[]>;
  resolveUrl(url: string): Promise<RawOffer>;
  supportsUrl(url: string): boolean;
}
