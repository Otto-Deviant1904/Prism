import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'PURPLLE',
  domain: 'purplle.com',
  urlPattern: /purplle\.com/,
  titleSelectors: ['.product-name', '.name', 'h3'],
  priceSelectors: ['.selling-price', '.price', '.final-price'],
  imageSelectors: ['img']
};

export class PurplleScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
