import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const CACHE_DIR = join(process.cwd(), '.tmp', 'serper-cache');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cacheKey(endpoint: string, params: Record<string, unknown>): string {
  const hash = createHash('sha256')
    .update(endpoint + JSON.stringify(params))
    .digest('hex');
  return join(CACHE_DIR, `${hash}.json`);
}

type CacheEntry<T> = {
  data: T;
  cachedAt: number;
};

export function cachedSerperCall<T>(
  endpoint: string,
  params: Record<string, unknown>,
  fetcher: () => Promise<T>
): Promise<T> {
  ensureCacheDir();
  const path = cacheKey(endpoint, params);

  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() - entry.cachedAt < CACHE_TTL_MS) {
        console.log(`[CACHE HIT] ${endpoint} ${JSON.stringify(params).slice(0, 80)}`);
        return Promise.resolve(entry.data);
      }
    } catch {
      // corrupted cache file, re-fetch
    }
  }

  console.log(`[CACHE MISS] ${endpoint} ${JSON.stringify(params).slice(0, 80)}`);
  return fetcher().then((data) => {
    try {
      const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
      writeFileSync(path, JSON.stringify(entry), 'utf-8');
    } catch {
      // cache write failure is non-fatal
    }
    return data;
  });
}

export function clearSerperCache(): void {
  ensureCacheDir();
  for (const file of readdirSync(CACHE_DIR)) {
    rmSync(join(CACHE_DIR, file), { force: true });
  }
  console.log('[CACHE CLEARED]');
}
