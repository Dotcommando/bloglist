import { expect, it } from 'vitest';

import { forkHarness } from '../support/fork-harness.js';

it('keeps only the desired real children through repeated allocation and database-pool changes', async () => {
  const f = await forkHarness();
  const retired: { exited: boolean }[] = [];

  try {
    for (let cycle = 0; cycle < 12; cycle++) {
      for (const site of f.sites) {
        for (let i = 0; i < f.supervisor.pool.running(site.siteId); i++) {
          retired.push(f.supervisor.pool.select(site.siteId));
        }
      }
      const state = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));
      const sites = state.sites.map((site, index) => ({ ...site, processes: index === 0 ? 1 + cycle % 2 : 1 }));

      await f.supervisor.resources.change({
        expectedVersion: state.version, databaseCpu: 1, sites, sitePoolSize: 2 + cycle % 2,
      });
      expect(retired.every((worker) => worker.exited)).toBe(true);
      const current = await f.supervisor.resources.read(f.sites.map((site) => site.siteId));

      expect(current.applyError).toBeNull();

      for (const site of sites) {
        expect(f.supervisor.pool.running(site.siteId)).toBe(site.processes);
      }

      for (const site of f.sites) {
        expect((await f.read(site.host)).status).toBe(200);
      }
    }
    await f.supervisor.close();
    expect(retired.every((worker) => worker.exited)).toBe(true);
  } finally {
    await f.close();
  }
}, 180000);
