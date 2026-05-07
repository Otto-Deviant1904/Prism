import { NextResponse } from 'next/server';
import { prisma } from '@vogue/db';
import { z } from 'zod';
import { assertAdminAccess } from '@/app/lib/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FeedbackSchema = z.object({
  feedbackType: z.enum(['WRONG_MATCH', 'MISSING_PRODUCT', 'THUMBS_UP', 'THUMBS_DOWN']),
  query: z.string().optional(),
  productId: z.string().optional(),
  offerId: z.string().optional(),
  note: z.string().max(1000).optional()
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  await prisma.feedback.create({ data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  try {
    assertAdminAccess(req);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const rows = await prisma.feedback.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  return NextResponse.json({ rows });
}
