import type { VisionResult } from './index';

export function buildSearchQuery(attributes: VisionResult['attributes']): string {
  const parts: string[] = [];
  if (attributes.color.length > 0) parts.push(attributes.color[0]);
  if (attributes.style.length > 0) parts.push(attributes.style[0]);
  parts.push(attributes.category);
  if (attributes.details.length > 0) parts.push(attributes.details[0]);
  return parts.filter(Boolean).join(' ');
}
