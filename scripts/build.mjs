import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function runNpm(args) {
  const executable = process.env.npm_execpath;

  if (!executable) {
    throw new Error('Run the build through npm run build');
  }
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, 'run', ...args], { stdio: 'inherit' });

    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build stage ${args[0]} failed (${signal ?? code})`));
      }
    });
  });
}

export async function runBuild({ run = runNpm, now = () => performance.now(), report = console.info } = {}) {
  const started = now();

  await run(['build:server']);
  await run(['build:runtime-addons']);
  await run(['build', '--workspace', '@zarya/admin']);
  report(`Zarya build completed in ${((now() - started) / 1000).toFixed(2)} s.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    await runBuild();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Zarya build failed.');
    process.exitCode = 1;
  }
}
