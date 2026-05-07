# TROUBLESHOOTING

## docker compose permission denied
Your user cannot access Docker daemon. Fix group permissions or run with sudo.

## Search stuck on PROCESSING
- Check worker logs.
- Check `/api/ops/queue` for failed jobs.
- Retry failed jobs: `pnpm --filter @vogue/worker retry:failed`.

## No results for valid products
- Run scraper harness: `pnpm --filter @vogue/worker test:scrapers`.
- Inspect `tmp/scraper-debug` snapshots.

## Admin endpoints return 404 in production
- Set `ADMIN_ENABLED=true` and `ADMIN_TOKEN`.
- Send `x-admin-token` header.
