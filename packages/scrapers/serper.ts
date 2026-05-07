import { logScraper } from './utils';
import { cachedSerperCall } from './serperCache';

export type SerperResult = {
  title: string;
  url: string;
};

export type ShoppingResult = {
  title: string;
  price: string;
  priceNumeric: number;
  store: string;
  link: string;
  image: string;
  rating?: number;
  reviews?: number;
  source: 'google_shopping';
};

function getApiKey(): string {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error('SERPER_API_KEY not set in .env');
  return key;
}

async function serperPost<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      'X-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Serper ${endpoint} returned ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function serperSearch(
  domain: string,
  query: string,
  options?: { num?: number; gl?: string; hl?: string }
): Promise<SerperResult[]> {
  const num = options?.num ?? 10;
  const gl = options?.gl ?? 'in';
  const hl = options?.hl ?? 'en';
  const params = { q: `site:${domain} ${query}`, num, gl, hl };

  try {
    const data = await cachedSerperCall<{
      organic?: { title?: string; link?: string }[];
      credits?: number;
    }>('search', params, () => serperPost<{
      organic?: { title?: string; link?: string }[];
      credits?: number;
    }>('search', params));

    const results: SerperResult[] = (data.organic ?? [])
      .filter((r) => r.link && r.link.includes(domain))
      .slice(0, num)
      .map((r) => ({
        title: r.title ?? '',
        url: r.link!,
      }));

    logScraper('scraper.serper.result', {
      domain,
      query,
      found: results.length,
      remainingCredits: data.credits,
    });

    return results;
  } catch (error) {
    logScraper('scraper.serper.error', { domain, query, error: String(error) });
    return [];
  }
}

export async function searchGoogleShopping(
  query: string,
  options?: { num?: number; gl?: string; hl?: string }
): Promise<ShoppingResult[]> {
  const num = options?.num ?? 20;
  const gl = options?.gl ?? 'in';
  const hl = options?.hl ?? 'en';
  const params = { q: query, num, gl, hl };

  try {
    const data = await cachedSerperCall<{
      shopping?: {
        title?: string;
        price?: string;
        link?: string;
        imageUrl?: string;
        source?: string;
        rating?: number;
        reviews?: number;
      }[];
      credits?: number;
    }>('shopping', params, () => serperPost<{
      shopping?: {
        title?: string;
        price?: string;
        link?: string;
        imageUrl?: string;
        source?: string;
        rating?: number;
        reviews?: number;
      }[];
      credits?: number;
    }>('shopping', params));

    const results: ShoppingResult[] = (data.shopping ?? []).map((item) => {
      const priceStr = (item.price ?? '').replace(/[₹,\s]/g, '');
      const priceNumeric = parseFloat(priceStr);
      return {
        title: item.title ?? '',
        price: item.price ?? '',
        priceNumeric: Number.isFinite(priceNumeric) ? priceNumeric : 0,
        store: item.source ?? '',
        link: item.link ?? '',
        image: item.imageUrl ?? '',
        rating: item.rating,
        reviews: item.reviews,
        source: 'google_shopping' as const,
      };
    });

    logScraper('scraper.serper.shopping', {
      query,
      found: results.length,
      remainingCredits: data.credits,
    });

    return results;
  } catch (error) {
    logScraper('scraper.serper.shopping.error', { query, error: String(error) });
    return [];
  }
}
