import { normalizeTitle, RawOffer, Store } from '@vogue/shared';
import {
  createContext,
  extractProductPageHttp,
  launchBrowser,
  logScraper,
  nowMs,
  safeGoto,
  withTimeout
} from './utils';
import { serperSearch } from './serper';

export type GenericStoreConfig = {
  store: Store;
  domain: string;
  urlPattern: RegExp;
  titleSelectors: string[];
  priceSelectors: string[];
  imageSelectors: string[];
};

export async function genericSearch(config: GenericStoreConfig, query: string): Promise<RawOffer[]> {
  const googleResults = await serperSearch(config.domain, query);

  if (googleResults.length > 0) {
    const offers: RawOffer[] = [];
    for (const gr of googleResults) {
      if (offers.length >= 8) break;
      try {
        const offer = await extractProductPage(config, gr.url);
        if (offer && offer.price > 0) {
          offers.push(offer);
        }
      } catch {
        // skip individual product page failures
      }
    }

    if (offers.length > 0) {
      logScraper('scraper.generic.search.success', {
        store: config.store,
        query,
        googleResults: googleResults.length,
        productPagesExtracted: offers.length,
        durationMs: nowMs()
      });
      return offers;
    }
  }

  logScraper('scraper.generic.search.empty', {
    store: config.store,
    query,
    googleResults: googleResults.length
  });
  return [];
}

export async function genericResolve(config: GenericStoreConfig, url: string): Promise<RawOffer> {
  const result = await extractProductPage(config, url);
  if (!result) {
    return {
      store: config.store,
      externalId: url.split('/').filter(Boolean).pop() || url,
      rawTitle: '',
      normalizedTitle: '',
      price: 0,
      url,
      imageUrl: '',
      inStock: false,
      scrapedAt: new Date().toISOString()
    };
  }
  return result;
}

async function extractProductPage(config: GenericStoreConfig, url: string): Promise<RawOffer | null> {
  const httpResult = await extractProductPageHttp(url, config.store, config.titleSelectors, config.priceSelectors, config.imageSelectors);
  if (httpResult) return httpResult;

  return extractProductPagePlaywright(config, url);
}

async function extractProductPagePlaywright(config: GenericStoreConfig, url: string): Promise<RawOffer | null> {
  try {
    const browser = await withTimeout(launchBrowser(true), 15000, 'browser launch');
    const context = await withTimeout(createContext(browser), 5000, 'context creation');
    const page = await withTimeout(context.newPage(), 5000, 'new page');
    try {
      await safeGoto(page, url);
      const resolveConfig = JSON.stringify({
        titleSelectors: config.titleSelectors,
        priceSelectors: config.priceSelectors,
        imageSelectors: config.imageSelectors
      });
      const data = await page.evaluate(`(function() {
        const c = ${resolveConfig};
        const pickText = function(selectors) {
          for (let i = 0; i < selectors.length; i++) {
            const el = document.querySelector(selectors[i]);
            if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
          }
          return '';
        };
        const pickImage = function(selectors) {
          for (let i = 0; i < selectors.length; i++) {
            const el = document.querySelector(selectors[i]);
            if (el && el.src) return el.src;
          }
          return '';
        };
        const rawTitle = pickText(c.titleSelectors.concat(['h1', 'h2']));
        const priceText = pickText(c.priceSelectors);
        const priceMatch = priceText.match(/[\\d,.]+/);
        return {
          rawTitle: rawTitle,
          price: priceMatch ? Number(priceMatch[0].replace(/,/g, '')) : 0,
          imageUrl: pickImage(c.imageSelectors.concat(['img']))
        };
      })()`) as unknown;
      const d = data as { rawTitle: string; price: number; imageUrl: string };
      if (!d.rawTitle || d.price <= 0) return null;
      return {
        store: config.store,
        externalId: url.split('/').filter(Boolean).pop() || url,
        rawTitle: d.rawTitle,
        normalizedTitle: normalizeTitle(d.rawTitle).name,
        price: d.price,
        url,
        imageUrl: d.imageUrl || '',
        inStock: true,
        scrapedAt: new Date().toISOString()
      };
    } finally {
      await browser.close().catch(() => {});
    }
  } catch {
    return null;
  }
}
