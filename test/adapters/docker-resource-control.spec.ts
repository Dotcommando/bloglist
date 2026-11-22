import { expect, it, vi } from 'vitest';

import {
  DockerResourceControlAdapter,
} from '../../src/adapters/outbound/runtime/docker/docker-resource-control.adapter.js';

it('verifies effective quotas and keeps desired configuration when application is uncertain', async () => {
  const persist = vi.fn(async () => {});
  const update = vi.fn(async () => {});
  const inspect = vi.fn(async () => ({ databaseCpu: 2.4, cmsCpu: 3.6, databaseImage: 'mongo:test' }));
  const adapter = new DockerResourceControlAdapter({ capacity: 6, infrastructureCpu: 0 }, { persist, update, inspect });

  expect(await adapter.apply({ databaseCpu: 2.4, cmsCpu: 3.6 })).toMatchObject({ databaseCpu: 2.4 });
  inspect.mockResolvedValueOnce({ databaseCpu: 1, cmsCpu: 3.6, databaseImage: 'mongo:test' });
  await expect(adapter.apply({ databaseCpu: 2.4, cmsCpu: 3.6 })).rejects.toThrow();
  expect(persist).toHaveBeenCalledTimes(2);
});

it('rejects invalid quotas before any Docker mutation, while allowing the one-CPU sharing mode', async () => {
  const boundary = {
    persist: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    inspect: async () => ({ databaseCpu: 1, cmsCpu: 1, databaseImage: null }),
  };
  const multi = new DockerResourceControlAdapter({ capacity: 6, infrastructureCpu: 0 }, boundary);

  await expect(multi.apply({ databaseCpu: 4, cmsCpu: 3 })).rejects.toThrow();
  expect(boundary.update).not.toHaveBeenCalled();
  await new DockerResourceControlAdapter({ capacity: 1, infrastructureCpu: 0 }, boundary)
    .apply({ databaseCpu: 1, cmsCpu: 1 });
});
