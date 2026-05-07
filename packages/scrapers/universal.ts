import { normalizeTitle, type RawOffer, type Store } from '@vogue/shared';
import { searchGoogleShopping, serperSearch, type ShoppingResult } from './serper';
import { logScraper } from './utils';

const STORE_TRUST_SCORES: Record<string, number> = {
  'nykaa.com': 95,
  'tirabeauty.com': 90,
  'myntra.com': 88,
  'amazon.in': 85,
  'flipkart.com': 85,
  'ajio.com': 82,
  'sephora.in': 80,
  'purplle.com': 78,
  'tatacliq.com': 75,
  'meesho.com': 65,
};

const INDIAN_BEAUTY_DOMAINS = [
  'nykaa.com',
  'tirabeauty.com',
  'myntra.com',
  'amazon.in',
  'flipkart.com',
  'ajio.com',
  'sephora.in',
  'purplle.com',
  'tatacliq.com',
  'savana.com',
  'reliancetrends.com',
  'www2.hm.com',
  'nykaafashion.com',
];

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return '';
  }
}

function trustScoreForDomain(domain: string): number {
  for (const [key, score] of Object.entries(STORE_TRUST_SCORES)) {
    if (domain === key || domain.endsWith('.' + key)) return score;
  }
  return 50;
}

const DOMAIN_TO_STORE: Record<string, Store> = {
  'nykaa.com': 'NYKAA',
  'tirabeauty.com': 'TIRA',
  'myntra.com': 'MYNTRA',
  'amazon.in': 'AMAZON',
  'flipkart.com': 'FLIPKART',
  'ajio.com': 'AJIO',
  'sephora.in': 'SEPHORA_INDIA',
  'purplle.com': 'PURPLLE',
  'tatacliq.com': 'TATACLIQ',
  'savana.com': 'SAVANA',
  'reliancetrends.com': 'RELIANCE_TRENDS',
  'www2.hm.com': 'HM_INDIA',
  'nykaafashion.com': 'NYKAA_FASHION',
};

function domainToStore(domain: string): Store | null {
  return DOMAIN_TO_STORE[domain] ?? null;
}

const STORE_SOURCE_MAP: Record<string, Store> = {
  'nykaa': 'NYKAA',
  'nykaa now': 'NYKAA',
  'tira': 'TIRA',
  'tira beauty': 'TIRA',
  'myntra': 'MYNTRA',
  'amazon': 'AMAZON',
  'amazon.in': 'AMAZON',
  'flipkart': 'FLIPKART',
  'ajio': 'AJIO',
  'sephora': 'SEPHORA_INDIA',
  'sephora india': 'SEPHORA_INDIA',
  'purplle': 'PURPLLE',
  'purplle.com': 'PURPLLE',
  'tatacliq': 'TATACLIQ',
  'savana': 'SAVANA',
  'reliance trends': 'RELIANCE_TRENDS',
  'hm': 'HM_INDIA',
  'h&m': 'HM_INDIA',
  'nykaa fashion': 'NYKAA_FASHION',
  'nykaafashion': 'NYKAA_FASHION',
};

function sourceToStore(source: string): Store | null {
  const key = source.toLowerCase().trim();
  if (STORE_SOURCE_MAP[key]) return STORE_SOURCE_MAP[key];
  for (const [pattern, store] of Object.entries(STORE_SOURCE_MAP)) {
    if (key.includes(pattern)) return store;
  }
  return null;
}

export type UniversalOffer = RawOffer & {
  trustScore: number;
  source: 'google_shopping' | 'google_web';
};

function shoppingToOffer(item: ShoppingResult): UniversalOffer | null {
  if (!item.link || !item.title) return null;

  const store = sourceToStore(item.store);
  if (!store) return null;

  const domain = extractDomain(item.link);
  const normalized = normalizeTitle(item.title);

  return {
    store,
    externalId: item.link.split('/').filter(Boolean).pop() || item.link,
    rawTitle: item.title,
    normalizedTitle: normalized.name,
    price: item.priceNumeric,
    url: item.link,
    imageUrl: item.image,
    inStock: true,
    scrapedAt: new Date().toISOString(),
    trustScore: trustScoreForDomain(domain),
    source: 'google_shopping',
  };
}

function webResultToOffer(
  title: string,
  url: string,
  store: Store
): UniversalOffer {
  const domain = extractDomain(url);
  const normalized = normalizeTitle(title);

  return {
    store,
    externalId: url.split('/').filter(Boolean).pop() || url,
    rawTitle: title,
    normalizedTitle: normalized.name,
    price: 0,
    url,
    imageUrl: '',
    inStock: true,
    scrapedAt: new Date().toISOString(),
    trustScore: trustScoreForDomain(domain),
    source: 'google_web',
  };
}

function deduplicate(offers: UniversalOffer[]): UniversalOffer[] {
  const seen = new Set<string>();
  return offers.filter((o) => {
    const key = o.url + o.store;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function universalSearch(
  query: string
): Promise<UniversalOffer[]> {
  const allResults: UniversalOffer[] = [];

  try {
    const shoppingResults = await searchGoogleShopping(query);
    for (const sr of shoppingResults) {
      const offer = shoppingToOffer(sr);
      if (offer) allResults.push(offer);
    }
    logScraper('universal.shopping.complete', {
      query,
      shoppingResults: shoppingResults.length,
      mapped: allResults.length,
    });
  } catch (error) {
    logScraper('universal.shopping.error', { query, error: String(error) });
  }

  if (allResults.length >= 10) {
    const deduped = deduplicate(allResults);
    deduped.sort((a, b) => a.price - b.price);
    logScraper('universal.search.complete', {
      query,
      total: deduped.length,
      stores: [...new Set(deduped.map((o) => o.store))].join(','),
      minPrice: deduped.length > 0 ? deduped[0].price : 0,
    });
    return deduped;
  }

  try {
    const webPromises = INDIAN_BEAUTY_DOMAINS.map((domain) =>
      serperSearch(domain, query, { num: 5 }).then((results) => ({ domain, results }))
    );
    const settled = await Promise.allSettled(webPromises);
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        const { domain, results } = result.value;
        const store = domainToStore(domain);
        if (!store) continue;
        for (const r of results) {
          allResults.push(webResultToOffer(r.title, r.url, store));
        }
      }
    }
    logScraper('universal.web.complete', {
      query,
      webResults: allResults.length,
    });
  } catch (error) {
    logScraper('universal.web.error', { query, error: String(error) });
  }

  const deduped = deduplicate(allResults);
  deduped.sort((a, b) => a.price - b.price);

  logScraper('universal.search.complete', {
    query,
    total: deduped.length,
    stores: [...new Set(deduped.map((o) => o.store))].join(','),
    minPrice: deduped.length > 0 ? deduped[0].price : 0,
  });

  return deduped;
}
