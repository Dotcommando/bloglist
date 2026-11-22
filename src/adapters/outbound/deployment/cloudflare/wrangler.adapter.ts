import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

async function executeProcess(command: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    });

    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

export async function runWrangler(configuration: string, dryRun: boolean,
  execute: (command: string, args: readonly string[]) => Promise<number> = executeProcess,
  proxySecret?: string, receipt?: string): Promise<void> {
  const requireModule = createRequire(import.meta.url);
  const entry = path.join(path.dirname(requireModule.resolve('wrangler/package.json')), 'bin/wrangler.js');
  const args = [entry, 'deploy', '--config', configuration];

  if (receipt) {
    args.push('--var', 'ZARYA_DEPLOYMENT_RECEIPT:' + receipt);
  }
  if (dryRun) {
    args.push('--dry-run', '--outdir', path.join(path.dirname(configuration), '.dry-run'));
  }

  const secretsFile = proxySecret ? path.join(path.dirname(configuration), '.secrets-' + randomUUID() + '.json') : null;

  try {
    if (secretsFile) {
      await writeFile(secretsFile, JSON.stringify({ ZARYA_EDGE_PROXY_SECRET: proxySecret }), {
        flag: 'wx', mode: 0o600,
      });
      args.push('--secrets-file', secretsFile);
    }
    if (await execute(process.execPath, args) !== 0) {
      throw new Error('Wrangler failed; the command did not acknowledge a successful Cloudflare deployment');
    }
  } finally {
    if (secretsFile) {
      await unlink(secretsFile);
    }
  }
}
