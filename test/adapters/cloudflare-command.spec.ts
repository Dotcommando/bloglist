import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runWrangler } from '../../src/adapters/outbound/deployment/cloudflare/wrangler.adapter.js';

describe('explicit Cloudflare upload command', () => {
  it('binds an attempt receipt to the uploaded Worker version', async () => {
    const execute = vi.fn<(command: string, args: readonly string[]) => Promise<number>>().mockResolvedValue(0);

    await runWrangler('/synthetic/deploy/wrangler.json', false, execute, undefined, 'attempt:release');
    const args = execute.mock.calls[0]?.[1] ?? [];

    expect(args[args.indexOf('--var') + 1]).toBe('ZARYA_DEPLOYMENT_RECEIPT:attempt:release');
  });
  it('keeps dry-run in the executed arguments and propagates failure', async () => {
    const execute = vi.fn<(command: string, args: readonly string[]) => Promise<number>>().mockResolvedValue(0);

    await runWrangler('/synthetic/deploy/wrangler.json', true, execute);
    expect(execute.mock.calls[0]?.[1]).toContain('--dry-run');
    expect(execute.mock.calls[0]?.[1]).toContain('/synthetic/deploy/wrangler.json');
    execute.mockResolvedValue(1);
    await expect(runWrangler('/synthetic/deploy/wrangler.json', false, execute)).rejects.toThrow();
  });

  it('passes secrets through a temporary private file and removes it after a failed upload', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-cf-command-'));
    let selected = '';
    const execute = async (command: string, args: readonly string[]): Promise<number> => {
      expect(command).toBe(process.execPath);
      selected = args[args.indexOf('--secrets-file') + 1] ?? '';
      expect(JSON.parse(await readFile(selected, 'utf8'))).toEqual({ ZARYA_EDGE_PROXY_SECRET: 'secret' });

      return 1;
    };

    try {
      await expect(runWrangler(path.join(root, 'wrangler.json'), false, execute, 'secret')).rejects.toThrow();
      await expect(readFile(selected)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

