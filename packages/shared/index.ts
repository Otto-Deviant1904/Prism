import { z } from 'zod';

export const StoreEnum = z.enum([
  'AMAZON',
  'NYKAA',
  'TIRA',
  'MYNTRA',
  'AJIO',
  'FLIPKART',
  'SAVANA',
  'SEPHORA_INDIA',
  'PURPLLE',
  'TATACLIQ',
  'RELIANCE_TRENDS',
  'HM_INDIA',
  'NYKAA_FASHION'
]);
export type Store = z.infer<typeof StoreEnum>;

export const StoreStatusEnum = z.enum(['OK', 'DEGRADED', 'BLOCKED', 'NO_RESULTS']);
export type StoreStatus = z.infer<typeof StoreStatusEnum>;

export const FailureReasonCodeEnum = z.enum([
  'BLOCKED_WAF',
  'BLOCKED_CAPTCHA',
  'HTTP2_FAILURE',
  'EMPTY_DOM',
  'SELECTOR_MISS',
  'NO_PRODUCT_PAYLOAD',
  'TIMEOUT'
]);
export type FailureReasonCode = z.infer<typeof FailureReasonCodeEnum>;

export interface RawOffer {
  store: Store;
  externalId: string;
  rawTitle: string;
  normalizedTitle: string;
  price: number;
  mrp?: number;
  url: string;
  imageUrl: string;
  inStock: boolean;
  scrapedAt: string;
  deliveryInfo?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export function classifyFailure(errorMessage: string): { status: StoreStatus; reason: FailureReasonCode } {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('http2') || msg.includes('err_http2_protocol_error')) {
    return { status: 'BLOCKED', reason: 'HTTP2_FAILURE' };
  }
  if (msg.includes('captcha') || msg.includes('robot')) {
    return { status: 'BLOCKED', reason: 'BLOCKED_CAPTCHA' };
  }
  if (msg.includes('403') || msg.includes('access denied') || msg.includes('503') || msg.includes('waf')) {
    return { status: 'BLOCKED', reason: 'BLOCKED_WAF' };
  }
  if (msg.includes('timeout')) {
    return { status: 'DEGRADED', reason: 'TIMEOUT' };
  }
  if (msg.includes('selector')) {
    return { status: 'DEGRADED', reason: 'SELECTOR_MISS' };
  }
  if (msg.includes('no offers') || msg.includes('no results')) {
    return { status: 'NO_RESULTS', reason: 'NO_PRODUCT_PAYLOAD' };
  }
  return { status: 'DEGRADED', reason: 'EMPTY_DOM' };
}

export interface NormalizedProduct {
  brand: string;
  name: string;
  volume?: string;
  shade?: string;
  category?: string;
}

export type MatchBreakdown = {
  brand: number;
  volume: number;
  shade: number;
  tokenOverlap: number;
};

export interface MatchDebug {
  score: number;
  breakdown: MatchBreakdown;
  reasons: string[];
}

export const SearchRequestSchema = z.object({
  q: z.string().min(2).max(140)
});

const BRAND_ALIASES: Record<string, string> = {
  'loreal': 'LOREAL',
  "l'oreal": 'LOREAL',
  'la roche posay': 'LA ROCHE POSAY',
  'dot & key': 'DOT AND KEY',
  'dot and key': 'DOT AND KEY',
  'the ordinary': 'THE ORDINARY',
  'm.a.c': 'MAC',
  mac: 'MAC',
  nykaa: 'NYKAA',
  lakme: 'LAKME',
  cetaphil: 'CETAPHIL',
  minimalist: 'MINIMALIST',
  neutrogena: 'NEUTROGENA',
  mamaearth: 'MAMAEARTH',
  bioderma: 'BIODERMA',
  maybelline: 'MAYBELLINE',
  plum: 'PLUM'
};

const STOP_WORDS = new Set([
  'for',
  'with',
  'combo',
  'pack',
  'new',
  'launch',
  'buy',
  'online',
  'best',
  'price',
  'free',
  'delivery',
  'official',
  'store',
  'india'
]);

const SHADE_WORDS = ['ivory', 'beige', 'nude', 'caramel', 'ruby', 'rose', 'taupe', 'sand'];

function normalizeUnicode(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUnits(text: string): string {
  return text
    .replace(/millilit(?:er|re)s?/gi, 'ml')
    .replace(/grams?/gi, 'g')
    .replace(/gms?/gi, 'g')
    .replace(/\bML\b/g, 'ml')
    .replace(/\bGM\b/g, 'g');
}

function cleanTitle(raw: string): string {
  return normalizeUnits(normalizeUnicode(raw))
    .toLowerCase()
    .replace(/[^a-z0-9\s.+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractBrand(cleanedTitle: string): string {
  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    if (cleanedTitle.includes(alias)) return canonical;
  }
  return 'UNKNOWN';
}

export function extractVolume(cleanedTitle: string): string | undefined {
  const match = cleanedTitle.match(/(\d+(?:\.\d+)?)\s?(ml|g|kg|oz)\b/i);
  if (!match) return undefined;
  const value = match[1];
  let unit = match[2].toLowerCase();
  if (unit === 'kg') unit = 'g';
  return `${value}${unit}`;
}

export function extractShade(cleanedTitle: string): string | undefined {
  for (const shade of SHADE_WORDS) {
    if (cleanedTitle.includes(shade)) return shade.toUpperCase();
  }
  return undefined;
}

function removeNoiseTokens(cleanedTitle: string): string {
  return cleanedTitle
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t) && t.length > 1)
    .join(' ')
    .trim();
}

export const normalizeTitle = (title: string): NormalizedProduct => {
  const clean = cleanTitle(title);
  const brand = extractBrand(clean);
  const volume = extractVolume(clean);
  const shade = extractShade(clean);

  const cleanedName = removeNoiseTokens(
    clean
      .replace(brand.toLowerCase(), ' ')
      .replace(volume ?? '', ' ')
      .replace(shade?.toLowerCase() ?? '', ' ')
  );

  return {
    brand,
    name: cleanedName,
    volume,
    shade,
    category: cleanedName.includes('serum') ? 'SERUM' : cleanedName.includes('cream') ? 'CREAM' : 'BEAUTY'
  };
};

export function slugifyProduct(product: {
  brand: string;
  name: string;
  volume?: string;
  shade?: string;
}): string {
  const raw = `${product.brand}-${product.name}-${product.volume ?? ''}-${product.shade ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return raw.slice(0, 140);
}

export function scoreMatch(rawTitle: string, canonical: { brand: string; name: string; volume?: string | null; shade?: string | null }): MatchDebug {
  const normalizedRaw = normalizeTitle(rawTitle);
  const reasons: string[] = [];

  const brandScore = normalizedRaw.brand === canonical.brand ? 0.4 : 0;
  if (brandScore === 0) reasons.push('brand_mismatch');

  const volumeScore =
    normalizedRaw.volume && canonical.volume && normalizedRaw.volume === canonical.volume ? 0.25 : 0;
  if (!volumeScore) reasons.push('volume_missing_or_mismatch');

  const shadeScore =
    normalizedRaw.shade && canonical.shade && normalizedRaw.shade === canonical.shade ? 0.15 : 0;

  const aTokens = new Set(normalizedRaw.name.split(' ').filter(Boolean));
  const bTokens = new Set(canonical.name.toLowerCase().split(' ').filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  const overlap = intersection / union;
  const tokenOverlapScore = overlap * 0.2;
  if (overlap < 0.4) reasons.push('low_token_overlap');

  return {
    score: brandScore + volumeScore + shadeScore + tokenOverlapScore,
    breakdown: {
      brand: brandScore,
      volume: volumeScore,
      shade: shadeScore,
      tokenOverlap: tokenOverlapScore
    },
    reasons
  };
}

export const SearchJobStatus = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
export type SearchJobStatus = z.infer<typeof SearchJobStatus>;
