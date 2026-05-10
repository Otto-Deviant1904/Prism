import { normalizeTitle, type RawOffer, type Store } from '@vogue/shared';
import { searchGoogleShopping, serperSearch, type ShoppingResult } from './serper';
import { isIndianHmUrl, isProductPage, isQueryRelevant, logScraper } from './utils';

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
  'meesho.com',
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
  if (!domain) return 'Store';
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
  'meesho.com': 'MEESHO',
};

function domainToStore(domain: string): Store | null {
  return DOMAIN_TO_STORE[domain] ?? null;
}

function sourceToStoreInfo(source: string): {
  store: Store;
  trustScore: number;
  displayName: string;
} {
  const normalized = source.toLowerCase()
    .replace(/\.com.*/, '')
    .replace(/\.in.*/, '')
    .replace(/\s*-\s*.*/, '')
    .trim();

  const knownStores: Record<string, { store: Store; trust: number; display: string }> = {
    nykaa: { store: 'NYKAA', trust: 95, display: 'Nykaa' },
    'nykaa now': { store: 'NYKAA', trust: 95, display: 'Nykaa' },
    myntra: { store: 'MYNTRA', trust: 88, display: 'Myntra' },
    ajio: { store: 'AJIO', trust: 82, display: 'Ajio' },
    amazon: { store: 'AMAZON', trust: 85, display: 'Amazon' },
    flipkart: { store: 'FLIPKART', trust: 85, display: 'Flipkart' },
    purplle: { store: 'PURPLLE', trust: 78, display: 'Purplle' },
    tira: { store: 'TIRA', trust: 90, display: 'Tira' },
    tatacliq: { store: 'TATACLIQ', trust: 75, display: 'Tata CLiQ' },
    meesho: { store: 'MEESHO', trust: 65, display: 'Meesho' },
    'shoppers stop': { store: 'OTHER', trust: 72, display: 'Shoppers Stop' },
    '1mg': { store: 'OTHER', trust: 70, display: '1mg' },
    pharmeasy: { store: 'OTHER', trust: 70, display: 'PharmEasy' },
    apollo247: { store: 'OTHER', trust: 70, display: 'Apollo 247' },
    bigbasket: { store: 'OTHER', trust: 68, display: 'BigBasket' },
    smytten: { store: 'OTHER', trust: 60, display: 'Smytten' },
    glamzy: { store: 'OTHER', trust: 55, display: 'Glamzy' },
    'lakme india': { store: 'OTHER', trust: 60, display: 'Lakme India' },
    'care to beauty': { store: 'OTHER', trust: 55, display: 'Care to Beauty' },
  };

  const match = knownStores[normalized] ?? knownStores[source.toLowerCase().replace(/\.com.*/, '').replace(/\.in.*/, '').trim()];
  if (match) return { store: match.store, trustScore: match.trust, displayName: match.display };

  return { store: 'OTHER' as Store, trustScore: 50, displayName: source };
}

export type UniversalOffer = RawOffer & {
  trustScore: number;
  storeDisplayName: string;
  source: 'google_shopping' | 'google_web';
};

function shoppingToOffer(item: ShoppingResult, query: string): UniversalOffer | null {
  if (!item.link || !item.title) return null;

  const info = sourceToStoreInfo(item.store);

  logScraper('universal.shopping.result', {
    url: item.link,
    title: item.title?.slice(0, 60),
    rawPrice: item.price,
    parsedPrice: item.priceNumeric,
    store: info.store,
  });

  if (item.priceNumeric === 0) {
    logScraper('universal.price.rejected', { url: item.link, title: item.title?.slice(0, 60), rawPrice: item.price });
    return null;
  }

  if (!isIndianHmUrl(item.link)) {
    logScraper('universal.hm.rejected', { url: item.link, reason: 'non-Indian H&M locale' });
    return null;
  }

  if (!isProductPage(item.link, item.title)) return null;

  if (!isQueryRelevant(query, item.title, item.link)) {
    logScraper('universal.relevance.rejected', { url: item.link, title: item.title, query });
    return null;
  }

  const normalized = normalizeTitle(item.title);

  return {
    store: info.store,
    externalId: item.link.split('/').filter(Boolean).pop() || item.link,
    rawTitle: item.title,
    normalizedTitle: normalized.name,
    price: item.priceNumeric,
    url: item.link,
    imageUrl: item.image,
    inStock: true,
    scrapedAt: new Date().toISOString(),
    trustScore: info.trustScore,
    storeDisplayName: info.displayName,
    source: 'google_shopping',
  };
}

function webResultToOffer(
  title: string,
  url: string,
  store: Store,
  query: string
): UniversalOffer | null {
  // H&M locale filter
  if (!isIndianHmUrl(url)) return null;

  if (!isProductPage(url, title)) return null;

  if (!isQueryRelevant(query, title, url)) {
    logScraper('universal.relevance.rejected', { url, title, query });
    return null;
  }

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

function filterRelevantResults(results: UniversalOffer[], query: string): UniversalOffer[] {
  const queryWords = query.toLowerCase().split(' ').filter(w => w.length > 2);
  if (queryWords.length === 0) return results;

  return results.filter(offer => {
    const titleLower = offer.rawTitle.toLowerCase();
    const matches = queryWords.some(word => titleLower.includes(word));
    if (!matches) {
      logScraper('universal.relevance.filtered', {
        url: offer.url,
        title: offer.rawTitle,
        query,
        reason: 'no query word found in title',
      });
    }
    return matches;
  });
}

export async function universalSearch(
  query: string
): Promise<UniversalOffer[]> {
  const allResults: UniversalOffer[] = [];

  try {
    const shoppingResults = await searchGoogleShopping(query);
    for (const sr of shoppingResults) {
      const offer = shoppingToOffer(sr, query);
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
    let deduped = deduplicate(allResults);
    deduped = filterRelevantResults(deduped, query);
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
          const offer = webResultToOffer(r.title, r.url, store, query);
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

  let deduped = deduplicate(allResults);
  deduped = filterRelevantResults(deduped, query);
  deduped.sort((a, b) => a.price - b.price);

  logScraper('universal.search.complete', {
    query,
    total: deduped.length,
    stores: [...new Set(deduped.map((o) => o.store))].join(','),
    minPrice: deduped.length > 0 ? deduped[0].price : 0,
  });

  return deduped;
}
