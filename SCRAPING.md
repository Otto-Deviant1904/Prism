# Scraping Architecture

## Universal Search (Primary)

The primary scraping strategy uses **Google Shopping** via the Serper.dev API.

### Flow

```
User query ("lumi cream")
  |
  v
universalSearch(query)
  |
  +---> searchGoogleShopping(query)
  |       POST https://google.serper.dev/shopping
  |       Returns up to 40 product listings with title, price, store, link
  |
  +---> Map store names -> Store enum (sourceToStore)
  |       "Nykaa" -> NYKAA, "Amazon.in" -> AMAZON, etc.
  |       Unknown stores are filtered out
  |
  +---> If < 10 results: fallback to web search
  |       serperSearch(domain, query) for each of 13 Indian beauty domains
  |       Uses site:{domain} {query} search
  |
  +---> Deduplicate by url+store
  +---> Sort by price ascending
  +---> Return UniversalOffer[] with trustScore
```

### Cache

All Serper API calls are cached to disk at `.tmp/serper-cache/{sha256}.json`.

- **TTL**: 6 hours
- **Cache key**: SHA256 of (endpoint + JSON params)
- **First run**: `[CACHE MISS]` — calls API, saves to disk
- **Subsequent runs**: `[CACHE HIT]` — reads from disk, no API call
- **Clearing**: `rm -rf .tmp/serper-cache/`

### Serper API

| Endpoint | URL | Purpose |
|---|---|---|
| Shopping | `POST /shopping` | Google Shopping product listings |
| Web Search | `POST /search` | Google web search with `site:` filter |

**Headers**: `X-API-KEY: ${SERPER_API_KEY}`, `Content-Type: application/json`

**Shopping params**: `{ q, num: 20, gl: "in", hl: "en" }`

**Web Search params**: `{ q: "site:{domain} {query}", num: 5, gl: "in", hl: "en" }`

## Store Trust Scores

Each result is scored by trustworthiness of the source domain:

| Domain | Trust Score |
|---|---|
| nykaa.com | 95 |
| tirabeauty.com | 90 |
| myntra.com | 88 |
| amazon.in | 85 |
| flipkart.com | 85 |
| ajio.com | 82 |
| sephora.in | 80 |
| purplle.com | 78 |
| tatacliq.com | 75 |
| meesho.com | 65 |
| Unknown | 50 |

Stored in `STORE_TRUST_SCORES` in `packages/scrapers/universal.ts`.

## Fallback: Per-Store Scrapers

If `universalSearch()` returns fewer than 3 results, the worker falls back to
individual per-store scrapers (Nykaa, Amazon, Tira — custom Playwright-based;
10 generic stores — Serper web search + HTTP product page extraction).

Existing scrapers are preserved at `packages/scrapers/*.ts`. They follow the
`IScraper` interface (`search`, `resolveUrl`, `supportsUrl`).

## Worker Integration

In `apps/worker/index.ts`:

1. `universalSearch(query)` runs first
2. If >= 3 results → use those, skip per-store scrapers for matched stores
3. If < 3 results → run all 13 per-store scrapers
4. For stores already covered by universal results, skip per-store scraping

## Product Page Extraction

For individual product pages (used by per-store scrapers):

1. **HTTP extraction** (`extractProductPageHttp`):
   - Fetches product page HTML via plain HTTP
   - Tries JSON-LD structured data
   - Falls back to Open Graph meta tags
   - Falls back to H1 heading + price regex
2. **Playwright fallback**: Only if HTTP extraction fails

## Key Files

| File | Purpose |
|---|---|
| `packages/scrapers/serper.ts` | Serper API client (shopping + web search) |
| `packages/scrapers/serperCache.ts` | Disk cache wrapper for Serper calls |
| `packages/scrapers/universal.ts` | Universal search orchestrator |
| `packages/scrapers/generic.ts` | Generic per-store scraper engine |
| `packages/scrapers/*.ts` | Individual store scrapers (13 total) |
| `packages/scrapers/utils.ts` | Shared utilities (browser, HTTP, logging) |
| `apps/worker/index.ts` | BullMQ worker with universal + fallback |
| `apps/worker/scripts/test-scrapers.ts` | Test all scrapers + universal search |

## Environment Variables

```
SERPER_API_KEY=<your-key>  # Required for Serper.dev API
```
