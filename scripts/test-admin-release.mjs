import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

process.chdir(root);

if (!process.env.ZARYA_TEST_MONGO_URI || !process.env.ZARYA_TEST_BROWSER_EXECUTABLE) {
  throw new Error('Set ZARYA_TEST_MONGO_URI and ZARYA_TEST_BROWSER_EXECUTABLE in .env or the environment');
}

await access(process.env.ZARYA_TEST_BROWSER_EXECUTABLE);

await mkdir(path.join(root, '.tmp/admin-release-results'), { recursive: true });

const npm = process.env.npm_execpath;

if (!npm) {
  throw new Error('Invoke this release gate with npm run test:release:admin');
}

async function run(script, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Release check failed: ' + (signal ?? code)));
      }
    });
  });
}

const started = performance.now();

await run(npm, ['run', 'build']);

await run(path.join(root, 'node_modules/vitest/vitest.mjs'), [
  'run', '--config', 'vitest.config.admin-release.ts', ...process.argv.slice(2),
]);

console.log('Administration release gate passed in ' + ((performance.now() - started) / 1000).toFixed(1) + 's');
