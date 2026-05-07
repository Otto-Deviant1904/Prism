import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'HM_INDIA',
  domain: 'www2.hm.com',
  urlPattern: /hm\.com/,
  titleSelectors: ['.item-heading', '.item-title', 'h2', 'h3'],
  priceSelectors: ['.item-price', '.price', '.sales'],
  imageSelectors: ['img']
};

export class HMIndiaScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
