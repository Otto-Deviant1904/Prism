import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import { prisma } from '@vogue/db';

async function main(): Promise<void> {
  const pending = await prisma.rejectedMatch.findMany({
    where: { reviewStatus: 'PENDING' },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
    take: 100
  });

  for (const row of pending) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        id: row.id,
        title: row.rawTitle,
        candidate: row.candidateProductName,
        confidence: row.confidence,
        reasons: row.reasons
      })
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
