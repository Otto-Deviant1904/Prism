import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function main(): Promise<void> {
  const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });
  const queue = new Queue('scrape-tasks', { connection });
  const job = await queue.add('scrape-search', { query: 'lumi cream', jobId: 'manual-test-job' });
  // eslint-disable-next-line no-console
  console.log(`queued test job ${job.id}`);
  await queue.close();
  await connection.quit();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
