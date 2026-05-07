import 'dotenv/config';
import { classifyFailure } from '@vogue/shared';
import {
  AjioScraper,
  AmazonScraper,
  FlipkartScraper,
  HMIndiaScraper,
  MyntraScraper,
  NykaaFashionScraper,
  NykaaScraper,
  PurplleScraper,
  RelianceTrendsScraper,
  SavanaScraper,
  SephoraIndiaScraper,
  TataCliqScraper,
  TiraScraper
} from '@vogue/scrapers';

async function main(): Promise<void> {
  const query = process.argv[2] || 'lumi cream';
  const scrapers = [
    new NykaaScraper(),
    new AmazonScraper(),
    new TiraScraper(),
    new MyntraScraper(),
    new AjioScraper(),
    new FlipkartScraper(),
    new SavanaScraper(),
    new SephoraIndiaScraper(),
    new PurplleScraper(),
    new TataCliqScraper(),
    new RelianceTrendsScraper(),
    new HMIndiaScraper(),
    new NykaaFashionScraper()
  ];

  // eslint-disable-next-line no-console
  console.log(`\nTesting ${scrapers.length} scrapers with query: "${query}"\n`);

  const results: Array<{ store: string; offers: number; status: string; reason: string }> = [];

  for (const scraper of scrapers) {
    // eslint-disable-next-line no-console
    process.stdout.write(`${scraper.store.padEnd(18)} `);

    let offers: Awaited<ReturnType<typeof scraper.search>> = [];
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after 45s`)), 45000)
      );
      try {
        offers = await Promise.race([scraper.search(query), timeout]);
      } catch (error) {
        lastError = error;
      }
      if (offers.length > 0) break;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    let status = 'OK';
    let reason = '';
    if (offers.length > 0) {
      status = 'OK';
      reason = `${offers.length} offers`;
    } else if (lastError) {
      const classified = classifyFailure(String(lastError));
      status = classified.status;
      reason = `${classified.reason}: ${String(lastError).slice(0, 80)}`;
    } else {
      status = 'NO_RESULTS';
      reason = '0 offers, no error';
    }

    // eslint-disable-next-line no-console
    console.log(`${status.padEnd(12)} ${reason}`);
    results.push({ store: scraper.store, offers: offers.length, status, reason });

    if (offers.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`  first offer: ${offers[0].rawTitle.slice(0, 80)} — ₹${offers[0].price}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n--- Summary ---');
  const ok = results.filter((r) => r.offers > 0).length;
  const blocked = results.filter((r) => r.status === 'BLOCKED').length;
  const degraded = results.filter((r) => r.status === 'DEGRADED').length;
  const noResults = results.filter((r) => r.status === 'NO_RESULTS').length;
  // eslint-disable-next-line no-console
  console.log(`OK: ${ok} | BLOCKED: ${blocked} | DEGRADED: ${degraded} | NO_RESULTS: ${noResults} | Total: ${results.length}`);
}

const globalTimer = setTimeout(() => {
  // eslint-disable-next-line no-console
  console.error('\nGlobal timeout reached (10min). Exiting.');
  process.exit(1);
}, 600000);

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => clearTimeout(globalTimer));
