import { getEnv, isAdminEnabled } from '@vogue/shared/env';

export function assertAdminAccess(req?: Request): void {
  if (!isAdminEnabled()) {
    throw new Error('Admin disabled');
  }
  const env = getEnv();
  if (env.NODE_ENV !== 'production') return;
  if (!env.ADMIN_TOKEN) {
    throw new Error('ADMIN_TOKEN not configured');
  }
  const headerToken = req?.headers.get('x-admin-token');
  if (headerToken !== env.ADMIN_TOKEN) {
    throw new Error('Unauthorized admin access');
  }
}
