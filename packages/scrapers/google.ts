import { logScraper } from './utils';

type GoogleResult = {
  title: string;
  url: string;
};

export async function googleSiteSearch(
  domain: string,
  query: string
): Promise<GoogleResult[]> {
  const results: GoogleResult[] = [];
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} ${query}`)}&hl=en&num=10`;
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'en-IN,en;q=0.9'
      }
    });
    if (!res.ok) return results;
    const html = await res.text();
    if (html.length < 500 || html.includes('captcha') || html.includes('unusual traffic')) return results;

    const urlSet = new Set<string>();

    const linkMatches = html.matchAll(/<a[^>]*href="(\/url\?q=([^"&]+))[^"]*"/g);
    for (const m of linkMatches) {
      try {
        const raw = decodeURIComponent(m[2]);
        if (raw.startsWith('http') && raw.includes(domain) && !raw.includes('google')) {
          urlSet.add(raw);
        }
      } catch { /* skip */ }
    }

    const directLinks = html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/g);
    for (const m of directLinks) {
      try {
        const url = m[1];
        if (url.includes(domain) && !url.includes('google')) {
          urlSet.add(url);
        }
      } catch { /* skip */ }
    }

    const titles: string[] = [];
    const titleMatches = html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g);
    for (const m of titleMatches) {
      const t = m[1].trim();
      if (t.length >= 5) titles.push(t);
    }

    let i = 0;
    for (const url of urlSet) {
      if (results.length >= 8) break;
      results.push({
        title: titles[i] || `result-${i}`,
        url
      });
      i += 1;
    }

    logScraper('scraper.google.search.result', {
      domain,
      query,
      urlsFound: urlSet.size,
      titlesFound: titles.length,
      resultsReturned: results.length,
      htmlLength: html.length
    });

    return results;
  } catch (error) {
    logScraper('scraper.google.search.error', { domain, query, error: String(error) });
    return [];
  }
}
