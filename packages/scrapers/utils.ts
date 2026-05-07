import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { normalizeTitle } from '@vogue/shared';
import type { RawOffer, Store } from '@vogue/shared';

const DEBUG_ROOT = process.env.SCRAPER_DEBUG_DIR || 'tmp/scraper-debug';

export function logScraper(event: string, payload: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...payload });
  // eslint-disable-next-line no-console
  console.log(line);
}

export async function launchBrowser(headless = true): Promise<Browser> {
  const proxyUrl = process.env.SCRAPER_PROXY_URL;
  return chromium.launch({
    headless,
    proxy: proxyUrl ? { server: proxyUrl } : undefined,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
}

export async function createContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'en-IN',
    viewport: { width: 1366, height: 1200 },
    extraHTTPHeaders: {
      'accept-language': 'en-IN,en;q=0.9',
      'upgrade-insecure-requests': '1'
    }
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  return context;
}

export async function safeGoto(page: Page, url: string, timeout = 20000): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout }).catch(() => {
    // timeout or error - page may still be usable
  });
}

export async function hydrateAndScroll(page: Page): Promise<void> {
  await page.waitForTimeout(1200);
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(600);
  }
}

export async function logSelectorCounts(page: Page, store: string, selectors: string[]): Promise<void> {
  const counts: Record<string, number> = {};
  for (const selector of selectors) {
    counts[selector] = await page.locator(selector).count();
  }
  logScraper('scraper.selector.counts', {
    store,
    url: page.url(),
    title: await page.title(),
    counts
  });
}

export function nowMs(): number {
  return Date.now();
}

const GARBAGE_TITLES = /^(wishlist|icon|loading|spinner|placeholder|main kv[ _]|product image|image|photo|slide|banner)\b/i;

export function isValidProductTitle(title: string): boolean {
  return title.length >= 8 && !GARBAGE_TITLES.test(title);
}

export function randomDelay(min = 1000, max = 3000): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!));
}

export async function captureFailureArtifacts(page: Page, store: string, label: string): Promise<{ htmlPath: string; screenshotPath: string }> {
  const dir = join(DEBUG_ROOT, store.toLowerCase(), new Date().toISOString().slice(0, 10));
  mkdirSync(dir, { recursive: true });
  const stamp = `${Date.now()}-${label}`;
  const htmlPath = join(dir, `${stamp}.html`);
  const screenshotPath = join(dir, `${stamp}.png`);

  let html = '<html><body>capture failed</body></html>';
  try {
    html = await page.content();
  } catch {
    // ignore
  }
  writeFileSync(htmlPath, html, 'utf-8');
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {
    // ignore
  }
  return { htmlPath, screenshotPath };
}

export function validateOfferShape(candidate: {
  rawTitle?: string;
  url?: string;
  price?: number;
  imageUrl?: string;
}): boolean {
  return Boolean(candidate.rawTitle && candidate.url && candidate.price && candidate.price > 0 && candidate.imageUrl);
}

export async function withRetries<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 700): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * i));
      }
    }
  }
  throw lastError;
}

type FallbackProduct = { title: string; price: number; url: string; imageUrl: string };

function parsePrice(text: string): number {
  const m = text.match(/[\d,]+(?:\.\d{2})?/);
  return m ? Number(m[0].replace(/,/g, '')) : 0;
}

export async function extractProductPageHttp(
  url: string,
  store: string,
  _titleSelectors: string[],
  _priceSelectors: string[],
  _imageSelectors: string[]
): Promise<RawOffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'en-IN,en;q=0.9'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length < 500) return null;

    // Strategy 1: JSON-LD
    const jsonldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonldMatch) {
      try {
        const parsed = JSON.parse(jsonldMatch[1]);
        const products = Array.isArray(parsed) ? parsed : [parsed];
        for (const p of products) {
          if (p['@type'] === 'Product' || p['@type'] === 'Item') {
            const title = p.name || '';
            const price = parsePrice(String(p.offers?.price || p.price || '0'));
            const imageUrl = typeof p.image === 'string' ? p.image : (p.image?.url || '');
            if (title && price > 0) {
              logScraper('scraper.product.http.jsonld', { store, url, title: title.slice(0, 80), price });
              return {
                store: store as Store,
                externalId: url.split('/').filter(Boolean).pop() || url,
                rawTitle: title,
                normalizedTitle: normalizeTitle(title).name,
                price,
                url,
                imageUrl: imageUrl || '',
                inStock: true,
                scrapedAt: new Date().toISOString()
              };
            }
          }
        }
      } catch { /* json parse failed */ }
    }

    // Strategy 2: Open Graph + meta tags
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    const ogPrice = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i);
    const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    const metaTitle = html.match(/<meta[^>]*name="title"[^>]*content="([^"]+)"/i);

    if (ogTitle || ogPrice) {
      const title = ogTitle?.[1] || metaTitle?.[1] || '';
      const price = ogPrice ? parsePrice(ogPrice[1]) : 0;
      if (title && price > 0) {
        return {
          store: store as Store,
          externalId: url.split('/').filter(Boolean).pop() || url,
          rawTitle: title,
          normalizedTitle: normalizeTitle(title).name,
          price,
          url,
          imageUrl: ogImage?.[1] || '',
          inStock: true,
          scrapedAt: new Date().toISOString()
        };
      }
    }

    // Strategy 3: direct HTML parsing
    const allPrices = Array.from(html.matchAll(/[₹Rs.]\s*([\d,]+(?:\.\d{2})?)/g))
      .map((m) => parsePrice(m[1]))
      .filter((p) => p > 0 && p < 100000);
    const h1 = html.match(/<h1[^>]*>([^<]{5,}?)<\/h1>/i);
    const titleAttr = html.match(/<meta[^>]*name="twitter:title"[^>]*content="([^"]+)"/i);
    const title = h1?.[1] || titleAttr?.[1] || '';
    const price = allPrices[0] || 0;
    if (title && price >= 50) {
      return {
        store: store as Store,
        externalId: url.split('/').filter(Boolean).pop() || url,
        rawTitle: title,
        normalizedTitle: normalizeTitle(title).name,
        price,
        url,
        imageUrl: '',
        inStock: true,
        scrapedAt: new Date().toISOString()
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchHtmlFallback(
  url: string,
  store: string
): Promise<FallbackProduct[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'en-IN,en;q=0.9'
      }
    });
    if (!res.ok) return [];
    const html = await res.text();
    if (html.length < 500) return [];

    const results: FallbackProduct[] = [];

    // Strategy 1: parse product cards via repeated HTML chunks
    const cardPatterns = [
      /<div[^>]*class="[^"]*(?:product|item|card|tile|result)[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?=<div|$)/gi,
      /<li[^>]*class="[^"]*(?:product|item|card|tile|result)[^"]*"[^>]*>[\s\S]*?<\/li>/gi,
      /<a[^>]*class="[^"]*(?:product|item|card|tile|result)[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
    ];

    for (const pattern of cardPatterns) {
      const cards = Array.from(html.matchAll(pattern)).slice(0, 48);
      if (cards.length < 2) continue;

      for (const cardMatch of cards) {
        const cardHtml = cardMatch[0];
        const linkMatch = cardHtml.match(/href="([^"]+)"/);
        if (!linkMatch) continue;
        const linkHref = linkMatch[1];
        if (linkHref.includes('javascript') || linkHref.startsWith('#')) continue;
        const productUrl = linkHref.startsWith('http') ? linkHref : new URL(linkHref, url).href;

        const titleMatch = cardHtml.match(/<img[^>]*alt="([^"]{8,}?)"/) ||
          cardHtml.match(/<h[\d][^>]*>([^<]{8,}?)<\/h[\d]>/);
        let title = '';
        if (titleMatch) {
          title = titleMatch[1].trim();
        } else {
          const textContent = cardHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const parts = textContent.split(/₹|Rs\./);
          if (parts.length > 1 && parts[0].length >= 8) {
            title = parts[0].trim();
          }
        }
        if (!title || title.length < 5) continue;

        const priceMatch = cardHtml.match(/[₹Rs.]\s*([\d,]+(?:\.\d{2})?)/);
        const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
        if (price <= 0) continue;

        const imgMatch = cardHtml.match(/src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/);
        const imageUrl = imgMatch ? imgMatch[1] : '';

        results.push({
          title: title.slice(0, 140),
          price,
          url: productUrl,
          imageUrl
        });
      }

      if (results.length >= 4) break;
    }

    // Strategy 2: heuristic fallback - link + price + img pairing
    if (results.length < 2) {
      const allLinks = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1])
        .filter((l) => !l.includes('javascript') && !l.startsWith('#'));
      const allPrices = Array.from(html.matchAll(/[₹Rs.]\s*([\d,]+(?:\.\d{2})?)/g))
        .map((m) => parsePrice(m[1]))
        .filter((p) => p > 0 && p < 100000);
      const allTitles = Array.from(html.matchAll(/alt="([^"]{10,}?)"/g)).map((m) => m[1])
        .concat(Array.from(html.matchAll(/<h[1-3][^>]*>([^<]{10,}?)<\/h[1-3]>/g)).map((m) => m[1]))
        .filter((t) => t.length >= 10);
      const allImages = Array.from(html.matchAll(/src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/g)).map((m) => m[1]);

      const count = Math.min(allLinks.length, allPrices.length, allTitles.length, 8);
      for (let i = 0; i < count && results.length < 8; i += 1) {
        const link = allLinks[i].startsWith('http') ? allLinks[i] : new URL(allLinks[i], url).href;
        if (results.some((r) => r.url === link)) continue;
        results.push({
          title: allTitles[i] || `product-${i}`,
          price: allPrices[i] || 0,
          url: link,
          imageUrl: allImages[i] || allImages[0] || ''
        });
      }
    }

    const uniqueResults = results.filter(
      (r, i, arr) => arr.findIndex((x) => x.url === r.url) === i
    ).slice(0, 12).filter((r) => r.price >= 50 && r.title.length >= 8 && isValidProductTitle(r.title));

    logScraper('scraper.html.fallback.result', {
      store,
      url,
      rawLength: html.length,
      strategy1Cards: results.length,
      uniqueResults: uniqueResults.length
    });

    return uniqueResults;
  } catch (error) {
    logScraper('scraper.html.fallback.error', { store, url, error: String(error) });
    return [];
  }
}
