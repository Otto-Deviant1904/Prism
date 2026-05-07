import 'dotenv/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function main(): Promise<void> {
  const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });
  const queue = new Queue('scrape-tasks', { connection });
  const failedJobs = await queue.getFailed(0, 50);

  for (const job of failedJobs) {
    await job.retry();
    // eslint-disable-next-line no-console
    console.log(`retried job ${job.id}`);
  }

  await queue.close();
  await connection.quit();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
