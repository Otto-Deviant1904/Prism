import 'dotenv/config';
import { chromium } from 'playwright';
import { AmazonScraper, NykaaScraper, TiraScraper } from '@vogue/scrapers';

async function inspectPage(url: string, selectors: string[]): Promise<void> {
  const browser = await chromium.launch({ headless: false, slowMo: 120 });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'en-IN'
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(800);
  }

  const counts: Record<string, number> = {};
  for (const selector of selectors) {
    counts[selector] = await page.locator(selector).count();
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ url: page.url(), title: await page.title(), selectorCounts: counts }, null, 2));
  // eslint-disable-next-line no-console
  console.log('Browser paused. Inspect manually, then press Enter to continue...');
  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });
  await browser.close();
}

async function main(): Promise<void> {
  const query = process.argv[2] || 'lumi cream';

  await inspectPage(`https://www.nykaa.com/search/result/?q=${encodeURIComponent(query)}`, [
    '[data-testid="product-card"]',
    '.product-listing > div',
    '.css-xrzmfa'
  ]);

  await inspectPage(`https://www.amazon.in/s?k=${encodeURIComponent(query)}`, [
    '[data-component-type="s-search-result"]',
    '.s-main-slot [data-asin]',
    '[data-cy="title-recipe"]'
  ]);

  await inspectPage(`https://www.tirabeauty.com/search?query=${encodeURIComponent(query)}`, [
    '[data-testid="product-card"]',
    '.product-card',
    '.product-tile'
  ]);

  const scrapers = [new NykaaScraper(), new AmazonScraper(), new TiraScraper()];
  for (const scraper of scrapers) {
    const offers = await scraper.search(query);
    // eslint-disable-next-line no-console
    console.log(`\n${scraper.store} extracted: ${offers.length}`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(offers.slice(0, 3), null, 2));
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
