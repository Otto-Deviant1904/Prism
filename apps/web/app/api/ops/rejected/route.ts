import { NextResponse } from 'next/server';
import { prisma } from '@vogue/db';
import { assertAdminAccess } from '@/app/lib/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    assertAdminAccess(req);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const rows = await prisma.rejectedMatch.findMany({
    where: { reviewStatus: 'PENDING' },
    take: 100,
    orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }]
  });
  return NextResponse.json({ count: rows.length, rows });
}
