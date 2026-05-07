import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'SEPHORA_INDIA',
  domain: 'sephora.in',
  urlPattern: /sephora\.in/,
  titleSelectors: ['.product-card__title', '.product-title', 'h3'],
  priceSelectors: ['.price-item--sale', '.price-item', '.money'],
  imageSelectors: ['img']
};

export class SephoraIndiaScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
