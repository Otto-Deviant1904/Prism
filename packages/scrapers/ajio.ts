import { RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import { GenericStoreConfig, genericResolve, genericSearch } from './generic';

const config: GenericStoreConfig = {
  store: 'AJIO',
  domain: 'ajio.com',
  urlPattern: /ajio\.com/,
  titleSelectors: ['.nameCls', '.brand', '.item-name'],
  priceSelectors: ['.price', '.price .orginal-price', '.discounted-price'],
  imageSelectors: ['img.rilrtl-lazy-img', 'img']
};

export class AjioScraper implements IScraper {
  store = config.store;
  supportsUrl(url: string): boolean { return config.urlPattern.test(url); }
  async search(query: string): Promise<RawOffer[]> { return genericSearch(config, query); }
  async resolveUrl(url: string): Promise<RawOffer> { return genericResolve(config, url); }
}
