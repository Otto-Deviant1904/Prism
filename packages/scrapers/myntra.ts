import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'MYNTRA',
  domain: 'myntra.com',
  urlPattern: /myntra\.com/,
  titleSelectors: ['h3.product-brand', 'h4.product-product', '.product-product'],
  priceSelectors: ['.product-discountedPrice', '.product-price', '.price'],
  imageSelectors: ['img.img-responsive', 'img']
};

export class MyntraScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
