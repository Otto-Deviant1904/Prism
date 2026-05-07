import { normalizeTitle, RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import {
  captureFailureArtifacts,
  createContext,
  extractProductPageHttp,
  hydrateAndScroll,
  launchBrowser,
  logScraper,
  logSelectorCounts,
  nowMs,
  safeGoto,
  validateOfferShape,
  withRetries
} from './utils';
import { serperSearch } from './serper';

export class TiraScraper implements IScraper {
  store = 'TIRA' as const;

  private inferBrandSlug(query: string): string {
    const n = normalizeTitle(query);
    if (n.brand !== 'UNKNOWN') return n.brand.toLowerCase().replace(/\s+/g, '-');
    const q = query.toLowerCase();
    if (q.includes('lumi')) return 'lakme';
    if (q.includes('fit me') || q.includes('maybelline')) return 'maybelline-new-york';
    if (q.includes('cetaphil')) return 'cetaphil';
    return 'lakme';
  }

  private async brandPageFallback(query: string): Promise<RawOffer[]> {
    const slug = this.inferBrandSlug(query);
    const browser = await launchBrowser(true);
    const context = await createContext(browser);
    const page = await context.newPage();
    try {
      await safeGoto(page, `https://www.tirabeauty.com/brand/${slug}`);
      await hydrateAndScroll(page);
      const rows = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('a[href*="/product/"]')).slice(0, 15);
        return cards.map((a) => {
          const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
          const priceMatch = text.match(/₹\s?([\d,]+)/);
          const titleMatch = text.match(/\|\d+(.+?)(Deal Price|MRP|₹|$)/i);
          return {
            url: (a as HTMLAnchorElement).href,
            rawTitle: (titleMatch?.[1] || text).trim().slice(0, 140),
            price: Number((priceMatch?.[1] || '0').replace(/,/g, '')),
            imageUrl: ((a.querySelector('img') as HTMLImageElement | null)?.src || '').trim()
          };
        });
      });

      return rows
        .filter((r) => r.url && r.rawTitle && r.price > 0)
        .map((r) => ({
          store: this.store,
          externalId: r.url.split('/').filter(Boolean).pop() || r.url,
          rawTitle: r.rawTitle,
          normalizedTitle: normalizeTitle(r.rawTitle).name,
          price: r.price,
          url: r.url,
          imageUrl: r.imageUrl || 'https://www.tirabeauty.com/favicon.ico',
          inStock: true,
          scrapedAt: new Date().toISOString()
        }));
    } finally {
      await browser.close();
    }
  }

  private extractFromJsonPayload(payload: unknown): Array<{ title: string; price: number; url: string; imageUrl: string }> {
    const out: Array<{ title: string; price: number; url: string; imageUrl: string }> = [];
    const walk = (node: unknown): void => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      const title =
        (typeof obj.name === 'string' && obj.name) ||
        (typeof obj.title === 'string' && obj.title) ||
        (typeof obj.product_name === 'string' && obj.product_name) ||
        '';
      const rawPrice =
        (typeof obj.price === 'number' && obj.price) ||
        (typeof obj.selling_price === 'number' && obj.selling_price) ||
        (typeof obj.final_price === 'number' && obj.final_price) ||
        (typeof obj.mrp === 'number' && obj.mrp) ||
        0;
      const slug =
        (typeof obj.slug === 'string' && obj.slug) ||
        (typeof obj.product_slug === 'string' && obj.product_slug) ||
        '';
      const imageUrl =
        (typeof obj.image === 'string' && obj.image) ||
        (typeof obj.image_url === 'string' && obj.image_url) ||
        (typeof obj.thumbnail === 'string' && obj.thumbnail) ||
        '';

      if (title && rawPrice > 0 && slug) {
        out.push({
          title,
          price: Number(rawPrice),
          url: slug.startsWith('http') ? slug : `https://www.tirabeauty.com/product/${slug}`,
          imageUrl
        });
      }

      for (const value of Object.values(obj)) walk(value);
    };

    walk(payload);
    return out.slice(0, 20);
  }

  supportsUrl(url: string): boolean {
    return /tirabeauty\.com/.test(url);
  }

  async search(query: string): Promise<RawOffer[]> {
    const googleResults = await serperSearch('tirabeauty.com', query);
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
        logScraper('scraper.tira.search.success', { query, googleResults: googleResults.length, count: offers.length });
        return offers;
      }
    }

    return withRetries(async () => {
      const start = nowMs();
      const browser = await launchBrowser(true);
      const context = await createContext(browser);
      const page = await context.newPage();
      const networkOffers: Array<{ title: string; price: number; url: string; imageUrl: string }> = [];

      page.on('response', async (response) => {
        try {
          const ct = response.headers()['content-type'] || '';
          if (!ct.includes('application/json')) return;
          const body = await response.json();
          const extracted = this.extractFromJsonPayload(body);
          if (extracted.length > 0) {
            networkOffers.push(...extracted);
          }
        } catch {
          // ignore response parse failures
        }
      });
      try {
        await safeGoto(page, `https://www.tirabeauty.com/search?query=${encodeURIComponent(query)}`);
        await hydrateAndScroll(page);
        await logSelectorCounts(page, this.store, [
          '[data-testid="product-card"]',
          '.product-card',
          '.product-tile',
          'a[href*="/product/"]'
        ]);
        const rawItems = await page.evaluate(() => {
          const cards = Array.from(
            document.querySelectorAll('[data-testid="product-card"], .product-card, .product-tile, [data-at="product-card"]')
          ).slice(0, 20);
          return cards.map((card) => {
            const anchor = card.querySelector('a') as HTMLAnchorElement | null;
            const title =
              card.querySelector('[data-testid="product-name"], [data-at="product-name"], .product-name, h3, h2')?.textContent?.trim() ?? '';
            const priceText =
              card.querySelector('[data-testid="selling-price"], [data-at="selling-price"], .selling-price, .price')?.textContent ?? '';
            const imageUrl = (card.querySelector('img') as HTMLImageElement | null)?.src ?? '';
            return {
              externalId: anchor?.href.split('/').filter(Boolean).pop() ?? '',
              rawTitle: title,
              price: Number((priceText.match(/[\d,.]+/)?.[0] ?? '0').replace(/,/g, '')),
              url: anchor?.href ?? '',
              imageUrl,
              inStock: !card.textContent?.includes('Out of stock')
            };
          });
        });

        let offers = rawItems
          .filter(validateOfferShape)
          .map((item) => ({
            ...item,
            store: this.store,
            normalizedTitle: normalizeTitle(item.rawTitle).name,
            scrapedAt: new Date().toISOString()
          } satisfies RawOffer));

        if (offers.length === 0 && networkOffers.length > 0) {
          offers = networkOffers.map((item, i) => ({
            store: this.store,
            externalId: item.url.split('/').filter(Boolean).pop() || `network-${i}`,
            rawTitle: item.title,
            normalizedTitle: normalizeTitle(item.title).name,
            price: item.price,
            url: item.url,
            imageUrl: item.imageUrl || 'https://www.tirabeauty.com/favicon.ico',
            inStock: true,
            scrapedAt: new Date().toISOString()
          }));
        }

        if (offers.length === 0) {
          const apiFallback = await page.evaluate(async (queryText) => {
            const paths = [
              `/service/application/search/v1.0/auto-complete?query=${encodeURIComponent(queryText)}`,
              `/service/application/search/v1.0/auto-complete?q=${encodeURIComponent(queryText)}`
            ];
            for (const path of paths) {
              try {
                const res = await fetch(path, { credentials: 'include' });
                if (!res.ok) continue;
                const json = await res.json();
                const serialized = JSON.stringify(json);
                return serialized;
              } catch {
                // continue
              }
            }
            return '';
          }, query);

          if (apiFallback) {
            try {
              const parsed = JSON.parse(apiFallback) as unknown;
              const extracted = this.extractFromJsonPayload(parsed);
              offers = extracted.map((item, i) => ({
                store: this.store,
                externalId: item.url.split('/').filter(Boolean).pop() || `api-${i}`,
                rawTitle: item.title,
                normalizedTitle: normalizeTitle(item.title).name,
                price: item.price,
                url: item.url,
                imageUrl: item.imageUrl || 'https://www.tirabeauty.com/favicon.ico',
                inStock: true,
                scrapedAt: new Date().toISOString()
              }));
            } catch {
              // ignore parse errors
            }
          }
        }

        if (offers.length === 0) {
          throw new Error('Tira extraction returned zero offers');
        }

        const title = await page.title();
        logScraper('scraper.tira.search.success', {
          query,
          url: page.url(),
          title,
          networkOfferCount: networkOffers.length,
          count: offers.length,
          durationMs: nowMs() - start
        });
        return offers;
      } catch (error) {
        const fallback = await this.brandPageFallback(query);
        const artifacts = await captureFailureArtifacts(page, this.store, 'search');
        logScraper('scraper.tira.search.failure', {
          query,
          url: page.url(),
          title: await page.title(),
          error: String(error),
          fallbackCount: fallback.length,
          ...artifacts,
          durationMs: nowMs() - start
        });
        return fallback;
      } finally {
        await browser.close();
      }
    });
  }

  async resolveUrl(url: string): Promise<RawOffer> {
    const httpResult = await extractProductPageHttp(url, this.store, [], [], []);
    if (httpResult) return httpResult;

    const browser = await launchBrowser(true);
    const context = await createContext(browser);
    const page = await context.newPage();
    try {
      await safeGoto(page, url);
      await hydrateAndScroll(page);
      const payload = await page.evaluate(() => {
        const rawTitle = document.querySelector('h1')?.textContent?.trim() ?? '';
        const imageUrl = (document.querySelector('img') as HTMLImageElement | null)?.src ?? '';
        const priceText =
          document.querySelector('[data-testid="selling-price"], .selling-price, .price')?.textContent ?? '';
        return {
          rawTitle,
          imageUrl,
          price: Number((priceText.match(/[\d,.]+/)?.[0] ?? '0').replace(/,/g, '')),
          inStock: !document.body.textContent?.includes('Out of stock')
        };
      });

      return {
        store: this.store,
        externalId: url.split('/').filter(Boolean).pop() ?? url,
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
}
