import { normalizeTitle, RawOffer } from '@vogue/shared';
import { IScraper } from './interface';
import {
  captureFailureArtifacts,
  createContext,
  extractProductPageHttp,
  fetchHtmlFallback,
  hydrateAndScroll,
  launchBrowser,
  logScraper,
  logSelectorCounts,
  nowMs,
  safeGoto,
  validateOfferShape,
  withRetries,
  withTimeout
} from './utils';
import { serperSearch } from './serper';

export class NykaaScraper implements IScraper {
  store = 'NYKAA' as const;

  private inferBrandForFallback(query: string): string {
    const n = normalizeTitle(query);
    if (n.brand !== 'UNKNOWN') return n.brand.toLowerCase();
    const q = query.toLowerCase();
    if (q.includes('lumi')) return 'lakme';
    if (q.includes('fit me') || q.includes('maybelline')) return 'maybelline-new-york';
    if (q.includes('cetaphil')) return 'cetaphil';
    return 'lakme';
  }

  private async htmlFallback(url: string, query: string): Promise<RawOffer[]> {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'accept-language': 'en-IN,en;q=0.9'
        }
      });
      const html = await res.text();
      const links = Array.from(html.matchAll(/href="(https:\/\/www\.nykaa\.com\/[^"]+)"/g))
        .map((m) => m[1])
        .filter((link) => /\/p\//.test(link))
        .slice(0, 12);
      const titles = Array.from(html.matchAll(/alt="([^"]+)"/g));
      const prices = Array.from(html.matchAll(/₹\s?([\d,]+)/g));

      const offers: RawOffer[] = [];
      for (let i = 0; i < Math.min(links.length, 8); i += 1) {
        const rawTitle = titles[i]?.[1] || query;
        const price = Number((prices[i]?.[1] || '0').replace(/,/g, ''));
        if (!links[i] || !rawTitle || price <= 0) continue;
        offers.push({
          store: this.store,
          externalId: links[i].split('/').filter(Boolean).pop() || `fallback-${i}`,
          rawTitle,
          normalizedTitle: normalizeTitle(rawTitle).name,
          price,
          url: links[i],
          imageUrl: 'https://images-static.nykaa.com/media/favicon/default/favicon.ico',
          inStock: true,
          scrapedAt: new Date().toISOString()
        });
      }

      if (offers.length > 0) return offers;

      const brand = this.inferBrandForFallback(query);
      const brandUrl = `https://www.nykaa.com/brands/${brand}/c/5960`;
      const brandRes = await fetch(brandUrl, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'accept-language': 'en-IN,en;q=0.9'
        }
      });
      const brandHtml = await brandRes.text();
      const brandLinks = Array.from(brandHtml.matchAll(/href="(https:\/\/www\.nykaa\.com\/[^"]+)"/g))
        .map((m) => m[1])
        .filter((link) => /\/p\//.test(link))
        .slice(0, 10);
      const brandTitles = Array.from(brandHtml.matchAll(/alt="([^"]+)"/g));
      const brandPrices = Array.from(brandHtml.matchAll(/₹\s?([\d,]+)/g));

      const brandOffers: RawOffer[] = [];
      for (let i = 0; i < Math.min(brandLinks.length, 8); i += 1) {
        const rawTitle = brandTitles[i]?.[1] || `${brand} product`;
        const price = Number((brandPrices[i]?.[1] || '0').replace(/,/g, ''));
        if (!brandLinks[i] || !rawTitle || price <= 0) continue;
        brandOffers.push({
          store: this.store,
          externalId: brandLinks[i].split('/').filter(Boolean).pop() || `brand-fallback-${i}`,
          rawTitle,
          normalizedTitle: normalizeTitle(rawTitle).name,
          price,
          url: brandLinks[i],
          imageUrl: 'https://images-static.nykaa.com/media/favicon/default/favicon.ico',
          inStock: true,
          scrapedAt: new Date().toISOString()
        });
      }

      return brandOffers;
    } catch {
      return [];
    }
  }

  supportsUrl(url: string): boolean {
    return /nykaa\.com/.test(url);
  }

  async search(query: string): Promise<RawOffer[]> {
    const googleResults = await serperSearch('nykaa.com', query);
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
        logScraper('scraper.nykaa.search.success', { query, googleResults: googleResults.length, count: offers.length });
        return offers;
      }
    }

    return withRetries(async () => {
      const start = nowMs();
      const browser = await withTimeout(launchBrowser(true), 15000, 'nykaa browser launch');
      const context = await withTimeout(createContext(browser), 5000, 'nykaa context');
      const page = await withTimeout(context.newPage(), 5000, 'nykaa page');

      try {
        const searchUrl = `https://www.nykaa.com/search/result/?q=${encodeURIComponent(query)}`;
        await safeGoto(page, searchUrl);
        await hydrateAndScroll(page);
        await logSelectorCounts(page, this.store, [
          '[data-testid="product-card"]',
          '.product-listing > div',
          '.css-xrzmfa',
          '[data-at="product-item"]'
        ]);

        const rawItems = await page.evaluate(() => {
          const cards = Array.from(
            document.querySelectorAll(
              '[data-testid="product-card"], .product-listing > div, .css-xrzmfa, [data-at="product-item"]'
            )
          ).slice(0, 16);
          return cards.map((card) => ({
            externalId: card.getAttribute('data-product-id') || '',
            rawTitle:
              card
                .querySelector(
                  '[data-testid="product-title"], [data-at="product-name"], .css-xrzmfa p, .product-title, .css-1gc4x7i'
                )
                ?.textContent?.trim() || '',
            price: Number(
              (card
                .querySelector('[data-testid="product-price"], [data-at="price"], .price, .css-111z9ua, .css-u05rr')
                ?.textContent?.match(/[\d,.]+/)?.[0] || '0').replace(/,/g, '')
            ),
            url: (card.querySelector('a') as HTMLAnchorElement | null)?.href || '',
            imageUrl: (card.querySelector('img') as HTMLImageElement | null)?.src || '',
            inStock: !card.textContent?.toLowerCase().includes('out of stock')
          }));
        });

        const offers = rawItems
          .filter(validateOfferShape)
          .map((item) => ({
            ...item,
            store: this.store,
            normalizedTitle: normalizeTitle(item.rawTitle).name,
            scrapedAt: new Date().toISOString()
          } satisfies RawOffer));

        if (offers.length === 0) {
          logScraper('scraper.nykaa.no_results', { query, durationMs: nowMs() - start, url: page.url(), title: await page.title() });
          throw new Error('Nykaa extraction returned zero offers');
        } else {
          logScraper('scraper.nykaa.search.success', { query, count: offers.length, durationMs: nowMs() - start });
        }
        return offers;
      } catch (error) {
        const artifacts = await captureFailureArtifacts(page, this.store, 'search');
        const fallbackOffers = await this.htmlFallback(`https://www.nykaa.com/search/result/?q=${encodeURIComponent(query)}`, query);
        const sharedFallback = fallbackOffers.length === 0
          ? await fetchHtmlFallback(`https://www.nykaa.com/search/result/?q=${encodeURIComponent(query)}`, this.store)
          : [];
        const allFallback = fallbackOffers.length > 0 ? fallbackOffers : sharedFallback.map((p) => ({
          store: this.store as 'NYKAA',
          externalId: p.url.split('/').filter(Boolean).pop() || `fb-${nowMs()}`,
          rawTitle: p.title,
          normalizedTitle: normalizeTitle(p.title).name,
          price: p.price,
          url: p.url,
          imageUrl: p.imageUrl,
          inStock: true,
          scrapedAt: new Date().toISOString()
        }));
        logScraper('scraper.nykaa.search.failure', {
          query,
          url: page.url(),
          title: await page.title(),
          error: String(error),
          fallbackCount: allFallback.length,
          ...artifacts,
          durationMs: nowMs() - start
        });
        return allFallback;
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

      const data = await page.evaluate(() => {
        const rawTitle =
          document.querySelector('h1')?.textContent?.trim() ||
          document.querySelector('[data-testid="product-name"]')?.textContent?.trim() ||
          '';
        const priceText =
          document.querySelector('[data-testid="price"]')?.textContent ||
          document.querySelector('.css-111z9ua')?.textContent ||
          '';
        const imageUrl = (document.querySelector('img') as HTMLImageElement | null)?.src || '';
        return {
          rawTitle,
          price: Number((priceText.match(/[\d,.]+/)?.[0] ?? '0').replace(/,/g, '')),
          imageUrl,
          inStock: !document.body.textContent?.toLowerCase().includes('out of stock')
        };
      });

      return {
        store: this.store,
        externalId: url.split('/').filter(Boolean).pop() || '',
        rawTitle: data.rawTitle || (await page.title()),
        normalizedTitle: normalizeTitle(data.rawTitle || (await page.title())).name,
        price: data.price,
        url,
        imageUrl: data.imageUrl,
        inStock: data.inStock,
        scrapedAt: new Date().toISOString()
      };
    } finally {
      await browser.close();
    }
  }
}
