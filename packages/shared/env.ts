import { z } from 'zod';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DEBUG_MODE: z.enum(['true', 'false']).optional(),
  NEXT_PUBLIC_DEBUG_MODE: z.enum(['true', 'false']).optional(),
  ADMIN_ENABLED: z.enum(['true', 'false']).optional(),
  ADMIN_TOKEN: z.string().optional()
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cachedEnv: AppEnv | null = null;
let attemptedDotenvLoad = false;

function findRootEnvPath(): string | null {
  let current = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const candidate = resolve(current, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function tryLoadDotenv(): void {
  if (attemptedDotenvLoad) return;
  attemptedDotenvLoad = true;
  const path = findRootEnvPath();
  if (!path) return;
  dotenv.config({ path });
}

export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
    tryLoadDotenv();
  }
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${message}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function isDebugMode(): boolean {
  const env = getEnv();
  if (env.NODE_ENV === 'production') return false;
  return env.DEBUG_MODE === 'true';
}

export function isAdminEnabled(): boolean {
  const env = getEnv();
  if (env.NODE_ENV !== 'production') return true;
  return env.ADMIN_ENABLED === 'true';
}
