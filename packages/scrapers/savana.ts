import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'SAVANA',
  domain: 'savana.com',
  urlPattern: /savana\.com/,
  titleSelectors: ['[data-testid="product-title"]', '.product-title', 'h3'],
  priceSelectors: ['[data-testid="product-price"]', '.price', '.selling-price'],
  imageSelectors: ['img']
};

export class SavanaScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
