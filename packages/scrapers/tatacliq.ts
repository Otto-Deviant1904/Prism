import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'TATACLIQ',
  domain: 'tatacliq.com',
  urlPattern: /tatacliq\.com/,
  titleSelectors: ['.ProductDescription__description', '.ProductDescription__title', 'h3'],
  priceSelectors: ['.ProductDescription__priceHolder', '.MOPPrice', '.price'],
  imageSelectors: ['img']
};

export class TataCliqScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
