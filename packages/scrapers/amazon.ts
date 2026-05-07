import { normalizeTitle, RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import {
  captureFailureArtifacts,
  createContext,
  fetchHtmlFallback,
  hydrateAndScroll,
  launchBrowser,
  logScraper,
  logSelectorCounts,
  nowMs,
  randomDelay,
  safeGoto,
  validateOfferShape,
  withRetries
} from './utils';
import { googleSiteSearch } from './google';

export class AmazonScraper implements IScraper {
  store = 'AMAZON' as const;

  supportsUrl(url: string): boolean {
    return /amazon\.in/.test(url);
  }

  async search(query: string): Promise<RawOffer[]> {
    const googleResults = await googleSiteSearch('amazon.in', query);
    if (googleResults.length > 0) {
      const offers: RawOffer[] = [];
      for (const gr of googleResults) {
        if (offers.length >= 6) break;
        try {
          const offer = await this.resolveUrl(gr.url);
          if (offer && offer.price > 0) offers.push(offer);
        } catch { /* skip */ }
      }
      if (offers.length > 0) {
        logScraper('scraper.amazon.search.success', { query, googleResults: googleResults.length, count: offers.length });
        return offers;
      }
    }

    await randomDelay(2000, 5000);
    return withRetries(async () => {
      const start = nowMs();
      const browser = await launchBrowser(true);
      const context = await createContext(browser);
      const page = await context.newPage();
      try {
        await safeGoto(page, `https://www.amazon.in/s?k=${encodeURIComponent(query)}`);
        await hydrateAndScroll(page);
        await logSelectorCounts(page, this.store, [
          '[data-component-type="s-search-result"]',
          '[data-cy="title-recipe"]',
          '.s-main-slot [data-asin]'
        ]);

        const rawItems = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('[data-component-type="s-search-result"], .s-main-slot [data-asin]')).slice(0, 20);
          return cards.map((item) => {
            const title =
              item.querySelector('h2 span')?.textContent?.trim() ??
              item.querySelector('[data-cy="title-recipe"] span')?.textContent?.trim() ??
              '';
            const anchor = (item.querySelector('h2 a') as HTMLAnchorElement | null) || (item.querySelector('a[href*="/dp/"]') as HTMLAnchorElement | null);
            const href = anchor?.href ?? '';
            const priceText =
              item.querySelector('.a-price .a-offscreen')?.textContent ??
              item.querySelector('.a-price[data-a-size="xl"] .a-offscreen')?.textContent ??
              item.querySelector('.a-price-whole')?.textContent ??
              '';
            const imageUrl = (item.querySelector('img.s-image') as HTMLImageElement | null)?.src ?? '';
            const asinFromHref = href.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] ?? '';
            const asin = item.getAttribute('data-asin') || asinFromHref;
            return {
              externalId: asin,
              rawTitle: title,
              price: Number((priceText.match(/[\d,.]+/)?.[0] ?? '0').replace(/,/g, '')),
              url: href,
              imageUrl,
              inStock: !item.textContent?.includes('Currently unavailable')
            };
          });
        });

        const offers = rawItems
          .filter((item) => Boolean(item.externalId))
          .filter((item) => Boolean(item.rawTitle))
          .filter((item) => Boolean(item.url))
          .filter((item) => item.price > 0)
          .map((item) => ({ ...item, imageUrl: item.imageUrl || 'https://www.amazon.in/favicon.ico' }))
          .filter(validateOfferShape)
          .map((item) => ({
            ...item,
            store: this.store,
            normalizedTitle: normalizeTitle(item.rawTitle).name,
            scrapedAt: new Date().toISOString()
          } satisfies RawOffer));

        const title = await page.title();
        if (offers.length === 0 && /503|captcha|robot|unavailable/i.test(title)) {
          throw new Error(`Amazon blocked page detected: ${title}`);
        }

        logScraper('scraper.amazon.search.success', {
          query,
          url: page.url(),
          title,
          count: offers.length,
          durationMs: nowMs() - start
        });
        return offers;
      } catch (error) {
        const artifacts = await captureFailureArtifacts(page, this.store, 'search');
        const htmlFallback = await fetchHtmlFallback(
          `https://www.amazon.in/s?k=${encodeURIComponent(query)}`,
          this.store
        );
        const fallbackOffers = htmlFallback.map((p) => ({
          store: this.store,
          externalId: p.url.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] ?? p.url,
          rawTitle: p.title,
          normalizedTitle: normalizeTitle(p.title).name,
          price: p.price,
          url: p.url,
          imageUrl: p.imageUrl || 'https://www.amazon.in/favicon.ico',
          inStock: true,
          scrapedAt: new Date().toISOString()
        }));
        logScraper('scraper.amazon.search.failure', {
          query,
          url: page.url(),
          title: await page.title(),
          error: String(error),
          fallbackCount: fallbackOffers.length,
          ...artifacts,
          durationMs: nowMs() - start
        });
        return fallbackOffers;
      } finally {
        await browser.close();
      }
    });
  }

  async resolveUrl(url: string): Promise<RawOffer> {
    const browser = await launchBrowser(true);
    const context = await createContext(browser);
    const page = await context.newPage();
    try {
      await safeGoto(page, url);
      await hydrateAndScroll(page);
      const payload = await page.evaluate(() => {
        const rawTitle = document.querySelector('#productTitle')?.textContent?.trim() ?? '';
        const imageUrl = (document.querySelector('#landingImage') as HTMLImageElement | null)?.src ?? '';
        const priceText =
          document.querySelector('.a-price .a-offscreen')?.textContent ??
          document.querySelector('#corePrice_feature_div .a-offscreen')?.textContent ??
          '';
        return {
          rawTitle,
          imageUrl,
          price: Number((priceText.match(/[\d,.]+/)?.[0] ?? '0').replace(/,/g, '')),
          inStock: !document.body.textContent?.includes('Currently unavailable')
        };
      });

      return {
        store: this.store,
        externalId: this.extractAsin(url),
        rawTitle: payload.rawTitle,
        normalizedTitle: normalizeTitle(payload.rawTitle).name,
        price: payload.price,
        url,
        imageUrl: payload.imageUrl,
        inStock: payload.inStock,
        scrapedAt: new Date().toISOString()
      };
    } finally {
      await browser.close();
    }
  }

  private extractAsin(url: string): string {
    const match = url.match(/\/dp\/([A-Z0-9]{10})/i);
    return match?.[1] ?? url;
  }
}
