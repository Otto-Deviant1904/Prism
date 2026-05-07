# DEPLOYMENT

## Vercel (web)
- Set env vars from `.env.example`.
- Ensure `NODE_ENV=production`.
- Set `ADMIN_ENABLED=true` only for internal ops access.
- Set `ADMIN_TOKEN` and pass `x-admin-token` header for ops endpoints in production.

## Railway (worker)
- Deploy `apps/worker` process command:
  - `pnpm --filter @vogue/worker dev`
- Configure same `DATABASE_URL`, `REDIS_URL`, `NODE_ENV=production`.

## Managed services guidance
- Postgres: Neon/Supabase/Railway Postgres with TLS URL.
- Redis: Upstash/Redis Cloud with persistent endpoint.

## Build verification checklist
1. `pnpm db:generate`
2. `pnpm typecheck`
3. `pnpm --filter @vogue/web build`
4. `pnpm test:rc`
