import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const root = process.cwd();
const envPath = resolve(root, '.env');

if (!existsSync(envPath)) {
  console.error('[env] Missing .env at repository root');
  console.error('[env] Copy .env.example to .env first');
  process.exit(1);
}

const loaded = dotenv.config({ path: envPath });
if (loaded.error) {
  console.error('[env] Failed to load .env:', loaded.error.message);
  process.exit(1);
}

const required = ['DATABASE_URL', 'REDIS_URL'];
const missing = required.filter((key) => !process.env[key] || String(process.env[key]).trim() === '');

if (missing.length > 0) {
  console.error(`[env] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('[env] OK: required environment variables are present');
