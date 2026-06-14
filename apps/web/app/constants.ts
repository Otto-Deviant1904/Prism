import type { StoreInfo } from './types';

export const STORE_INFO: Record<string, StoreInfo> = {
  AMAZON: { displayName: 'Amazon', trustScore: 85 },
  FLIPKART: { displayName: 'Flipkart', trustScore: 85 },
  MYNTRA: { displayName: 'Myntra', trustScore: 88 },
  AJIO: { displayName: 'Ajio', trustScore: 82 },
  NYKAA: { displayName: 'Nykaa', trustScore: 95 },
  NYKAA_FASHION: { displayName: 'Nykaa Fashion', trustScore: 90 },
  TIRA: { displayName: 'Tira', trustScore: 90 },
  SEPHORA_INDIA: { displayName: 'Sephora', trustScore: 80 },
  PURPLLE: { displayName: 'Purplle', trustScore: 78 },
  TATACLIQ: { displayName: 'Tata CLiQ', trustScore: 75 },
  RELIANCE_TRENDS: { displayName: 'Reliance Trends', trustScore: 70 },
  MEESHO: { displayName: 'Meesho', trustScore: 65 },
  SAVANA: { displayName: 'Savana', trustScore: 60 },
  HM_INDIA: { displayName: 'H&M', trustScore: 78 },
};

export const DEMO_QUERIES = ['lumi cream', 'cetaphil cleanser', 'maybelline fit me foundation'];
export const SUGGESTED = ['black dress', 'moisturizer', 'red lipstick', 'kurta set'];
export const RECENT_KEY = 'voguevault:recent-searches';
