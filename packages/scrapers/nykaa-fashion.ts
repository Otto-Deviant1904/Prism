import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'NYKAA_FASHION',
  domain: 'nykaafashion.com',
  urlPattern: /nykaafashion\.com/,
  titleSelectors: ['.product-name', '.name', 'h3'],
  priceSelectors: ['.price', '.special-price', '.final-price'],
  imageSelectors: ['img']
};

export class NykaaFashionScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
