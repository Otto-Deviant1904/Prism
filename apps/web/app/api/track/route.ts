import { NextResponse } from 'next/server';
import { prisma } from '@vogue/db';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TrackSchema = z.object({
  eventType: z.string().min(2),
  query: z.string().optional(),
  normalizedQuery: z.string().optional(),
  status: z.string().optional(),
  store: z.enum(['AMAZON', 'NYKAA', 'TIRA']).optional(),
  resultCount: z.number().int().optional(),
  latencyMs: z.number().int().optional(),
  meta: z.record(z.any()).optional()
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = TrackSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  await prisma.searchEvent.create({
    data: {
      query: parsed.data.query ?? '',
      normalizedQuery: parsed.data.normalizedQuery ?? parsed.data.query ?? '',
      eventType: parsed.data.eventType,
      status: parsed.data.status,
      store: parsed.data.store,
      resultCount: parsed.data.resultCount,
      latencyMs: parsed.data.latencyMs,
      meta: parsed.data.meta
    }
  });

  return NextResponse.json({ ok: true });
}
