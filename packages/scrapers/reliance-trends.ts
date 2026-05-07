import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'RELIANCE_TRENDS',
  domain: 'reliancetrends.com',
  urlPattern: /reliancetrends\.com/,
  titleSelectors: ['.product-name', '.name', 'h3'],
  priceSelectors: ['.price', '.selling-price', '.special-price'],
  imageSelectors: ['img']
};

export class RelianceTrendsScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
