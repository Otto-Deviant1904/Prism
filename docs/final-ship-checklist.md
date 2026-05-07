# Final MVP Ship Checklist

## Launch checklist
- [ ] `pnpm typecheck` passes
- [ ] `pnpm --filter @vogue/web build` passes
- [ ] `pnpm db:generate && pnpm db:push && pnpm db:seed` completed
- [ ] worker running and processing live search jobs
- [ ] demo queries return visible comparisons

## Operational checklist
- [ ] queue waiting < 20 for 15 mins steady state
- [ ] failed jobs not increasing continuously
- [ ] rejected matches reviewed at least daily
- [ ] scraper debug artifacts inspected for repeated failures

## Monitoring checklist
- [ ] `/api/ops/queue` healthy
- [ ] `/api/ops/metrics` shows search events and top queries
- [ ] `/api/ops/rejected` reviewed
- [ ] `/admin` page accessible internally

## Known limitations
- Selector fragility can still break on store DOM updates
- Some anti-bot interstitial pages can produce empty results
- Conservative matching can miss valid matches

## Rollback / recovery
1. Stop worker process
2. Re-deploy previous known-good commit
3. Clear queue (`bullmq` UI or script)
4. Keep DB data; only clear failed jobs if reprocessing is noisy
5. Re-start worker and verify `/api/ops/queue`
