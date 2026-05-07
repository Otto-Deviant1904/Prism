import { normalizeTitle, type RawOffer, type Store } from '@vogue/shared';
import { searchGoogleShopping, serperSearch, type ShoppingResult } from './serper';
import { isProductPage, logScraper } from './utils';

const STORE_TRUST_SCORES: Record<string, number> = {
  'amazon.in': 85,
  'flipkart.com': 85,
  'myntra.com': 88,
  'ajio.com': 82,
  'nykaa.com': 95,
  'nykaafashion.com': 90,
  'tirabeauty.com': 90,
  'sephora.in': 80,
  'purplle.com': 78,
  'tatacliq.com': 75,
  'reliancetrends.com': 70,
  'meesho.com': 65,
  'savana.com': 60,
  'www2.hm.com': 78,
  'hm.com': 78,
};

const DOMAIN_TO_DISPLAY_NAME: Record<string, string> = {
  'amazon.in': 'Amazon',
  'flipkart.com': 'Flipkart',
  'myntra.com': 'Myntra',
  'ajio.com': 'Ajio',
  'nykaa.com': 'Nykaa',
  'nykaafashion.com': 'Nykaa Fashion',
  'tirabeauty.com': 'Tira',
  'sephora.in': 'Sephora',
  'purplle.com': 'Purplle',
  'tatacliq.com': 'Tata CLiQ',
  'reliancetrends.com': 'Reliance Trends',
  'meesho.com': 'Meesho',
  'savana.com': 'Savana',
  'www2.hm.com': 'H&M',
  'hm.com': 'H&M',
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

const getRawDomain = (link: string): string => {
  try {
    return new URL(link).hostname.replace('www.', '');
  } catch {
    return '';
  }
};

function trustScoreForDomain(domain: string): number {
  return STORE_TRUST_SCORES[domain] ?? 50;
}

function displayNameForDomain(domain: string): string {
  return DOMAIN_TO_DISPLAY_NAME[domain] ?? domain.charAt(0).toUpperCase() + domain.slice(1);
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

export type UniversalOffer = RawOffer & {
  trustScore: number;
  storeDisplayName: string;
  source: 'google_shopping' | 'google_web';
};

function shoppingToOffer(item: ShoppingResult): UniversalOffer | null {
  if (!item.link || !item.title) return null;

  const domain = getRawDomain(item.link);
  if (!domain) return null;

  const store = domainToStore(domain);
  if (!store) return null;

  if (!isProductPage(item.link, item.title)) return null;

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
    storeDisplayName: displayNameForDomain(domain),
    source: 'google_shopping',
  };
}

function webResultToOffer(
  title: string,
  url: string,
  store: Store
): UniversalOffer | null {
  if (!isProductPage(url, title)) return null;

  const domain = getRawDomain(url);
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
    storeDisplayName: displayNameForDomain(domain),
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
          const offer = webResultToOffer(r.title, r.url, store);
          if (offer) allResults.push(offer);
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
