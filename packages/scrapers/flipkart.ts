import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'FLIPKART',
  domain: 'flipkart.com',
  urlPattern: /flipkart\.com/,
  titleSelectors: ['.s1Q9rs', '.IRpwTa', '._4rR01T'],
  priceSelectors: ['._30jeq3', '.Nx9bqj'],
  imageSelectors: ['img._396cs4', 'img']
};

export class FlipkartScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
