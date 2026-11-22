import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';

import { expect, it } from 'vitest';

import { forkHarness, workerMessage } from '../support/fork-harness.js';

it('does not replay an acknowledged-by-storage POST when its serving process dies before the HTTP acknowledgement',
  async () => {
    const f = await forkHarness();

    try {
      const site = f.sites[0]!;
      const worker = f.supervisor.pool.select(site.siteId);
      const committed = workerMessage(worker.child, 'test-committed');
      const address = f.supervisor.server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Missing test listener');
      }

      const response = new Promise<number>((resolve, reject) => {
        const outgoing = request({
          host: '127.0.0.1', port: address.port, method: 'POST', path: '/__test/commit', headers: { Host: site.host },
        }, (incoming) => {
          incoming.on('error', reject);
          incoming.resume();
          incoming.on('end', () => resolve(incoming.statusCode!));
        });

        outgoing.on('error', reject);
        outgoing.end('write once');
      });
      const observed = response.then((status) => ({ status }), (error: unknown) => ({ error }));

      await committed;
      const exited = once(worker.child, 'exit');

      worker.child.kill('SIGKILL');
      await exited;
      const outcome = await observed;

      if ('status' in outcome) {
        expect(outcome.status).toBe(503);
      }
      expect(await readFile(path.join(f.root, 'test-commits'), 'utf8')).toBe('committed\n');
      await expect.poll(() => f.supervisor.pool.running(site.siteId), { timeout: 15000 }).toBe(1);
      expect((await f.read(site.host)).status).toBe(200);
      expect(await readFile(path.join(f.root, 'test-commits'), 'utf8')).toBe('committed\n');
    } finally {
      await f.close();
    }
  }, 60000);
