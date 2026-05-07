import { logScraper } from './utils';

export type SerperResult = {
  title: string;
  url: string;
};

function getApiKey(): string {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error('SERPER_API_KEY not set in .env');
  return key;
}

export async function serperSearch(
  domain: string,
  query: string,
  options?: { num?: number; gl?: string; hl?: string }
): Promise<SerperResult[]> {
  const num = options?.num ?? 10;
  const gl = options?.gl ?? 'in';
  const hl = options?.hl ?? 'en';

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'X-API-KEY': getApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: `site:${domain} ${query}`,
        num,
        gl,
        hl,
      }),
    });

    if (!res.ok) {
      logScraper('scraper.serper.error', { domain, query, status: res.status });
      return [];
    }

    const data = await res.json() as {
      organic?: { title?: string; link?: string }[];
      credits?: number;
    };

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
