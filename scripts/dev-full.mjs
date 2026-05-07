import { spawn } from 'node:child_process';

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed (${code})`))));
  });
}

function runDetached(command, args, label) {
  const child = spawn(command, args, { stdio: 'inherit', shell: false });
  child.on('exit', (code) => {
    // eslint-disable-next-line no-console
    console.log(`[${label}] exited with code ${code}`);
  });
  return child;
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('\n== VogueVault dev:full ==');
  // eslint-disable-next-line no-console
  console.log('1) Starting docker infra...');
  await run('docker', ['compose', 'up', '-d']);

  // eslint-disable-next-line no-console
  console.log('2) Generating Prisma client...');
  await run('pnpm', ['db:generate']);

  // eslint-disable-next-line no-console
  console.log('3) Pushing Prisma schema...');
  await run('pnpm', ['db:push']);

  // eslint-disable-next-line no-console
  console.log('4) Starting worker + web...\n');
  const worker = runDetached('pnpm', ['--filter', '@vogue/worker', 'dev'], 'worker');
  const web = runDetached('pnpm', ['--filter', '@vogue/web', 'dev'], 'web');

  process.on('SIGINT', () => {
    worker.kill('SIGINT');
    web.kill('SIGINT');
    process.exit(0);
  });

  await new Promise(() => {});
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('dev:full failed', error.message);
  process.exit(1);
});
