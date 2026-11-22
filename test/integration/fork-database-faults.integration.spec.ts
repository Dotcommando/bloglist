import { rm, writeFile } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import path from 'node:path';

import { expect, it } from 'vitest';

import { forkHarness } from '../support/fork-harness.js';

it.each(['refused', 'unresponsive'])('keeps old workers when MongoDB startup fails: %s', async (fault) => {
  const f = await forkHarness();
  const connections = new Set<Socket>();
  const unreachable = createServer((socket) => {
    connections.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => connections.delete(socket));
  });

  await new Promise<void>((resolve) => unreachable.listen(0, '127.0.0.1', resolve));
  const address = unreachable.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing fault listener');
  }
  if (fault === 'refused') {
    await new Promise<void>((resolve) => unreachable.close(() => resolve()));
  }

  const faultFile = path.join(f.root, 'worker-mongo-uri.json');
  let changing: Promise<unknown> | undefined;

  try {
    const state = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));
    const old = f.supervisor.pool.select(f.sites[0]!.siteId);

    await writeFile(faultFile, JSON.stringify(`mongodb://127.0.0.1:${address.port}/?directConnection=true`));
    const input = { expectedVersion: state.version, databaseCpu: 1, sites: state.sites, sitePoolSize: 2 };
    let settled = false;

    changing = f.supervisor.resources.change(input).then(() => ({ success: true }), (error: unknown) => {
      settled = true;

      return { error };
    });
    let reads = 0;

    while (!settled) {
      for (const site of f.sites) {
        const response = await f.read(site.host);

        expect(response.status).toBe(200);
      }
      expect(old.retiring).toBe(false);
      reads++;
    }
    expect(await changing).toHaveProperty('error');
    expect(reads).toBeGreaterThan(0);
    const failed = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));

    expect(failed.applyError).toBeTruthy();
    expect(failed.databasePools).toMatchObject({ sitePoolSize: 2, appliedSitePoolSize: null });
    expect(f.supervisor.pool.select(f.sites[0]!.siteId).child.pid).toBe(old.child.pid);
    await rm(faultFile);
    await f.supervisor.resources.change({ ...input, expectedVersion: failed.version });
    const recovered = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));

    expect(recovered.applyError).toBeNull();
    expect(recovered.databasePools?.appliedSitePoolSize).toBe(2);
    expect(old.exited).toBe(true);
  } finally {
    await rm(faultFile, { force: true });
    connections.forEach((socket) => socket.destroy());

    if (unreachable.listening) {
      await new Promise<void>((resolve) => unreachable.close(() => resolve()));
    }
    await Promise.allSettled([changing]);
    await f.close();
  }
}, 90000);
