import { STORE_INFO } from '@/app/constants';
import type { StoreInfo } from '@/app/types';

export function trustColor(score: number): string {
  if (score >= 80) return '#22C55E';
  if (score >= 60) return '#EAB308';
  return '#EF4444';
}

export function storeInfo(store: string): StoreInfo {
  return STORE_INFO[store] ?? { displayName: store.charAt(0) + store.slice(1).toLowerCase(), trustScore: 50 };
}

export function formatPrice(n: number): string {
  return '₹' + n.toLocaleString('en-IN');
}
