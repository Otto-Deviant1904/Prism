# Beta Hardening Checklist

## Critical bugs before launch
- Wrong cross-site product match displayed to users
- Scraper returns zero prices for top 20 tracked queries
- Queue stuck with growing failed jobs for >15 minutes
- API returns 200 with empty results for completed jobs with existing offers

## Operational checks
- `GET /api/ops/queue` healthy: failed count stable
- Worker heartbeat log every 30s
- `tmp/scraper-debug` folder grows only on real failures
- `RejectedMatch` queue reviewed daily

## Known limitations
- Live scraping is brittle when selectors shift
- Tira/Amazon anti-bot pages may intermittently produce empty results
- Matching thresholds are heuristic and need weekly tuning

## Scraper monitoring checklist
- Daily run: `pnpm --filter @vogue/worker test:scrapers`
- Daily run: `pnpm --filter @vogue/worker test:golden`
- Retry failed jobs: `pnpm --filter @vogue/worker retry:failed`
- Review uncertain matches: `pnpm --filter @vogue/worker review:rejected`
