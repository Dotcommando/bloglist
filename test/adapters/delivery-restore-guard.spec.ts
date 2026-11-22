import * as fs from 'node:fs/promises';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FileDeliveryRestoreGuard,
} from '../../src/adapters/outbound/deployment/files/delivery-restore-guard.adapter.js';

vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof fs>(),
}));

it('releases the operation lock when resolved-marker removal fails and reconciles on the next pass', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-delivery-cleanup-'));
  const guard = new FileDeliveryRestoreGuard(root);
  const original = rm;
  const primary = Object.assign(new Error('Synthetic marker unlink failure'), { code: 'EACCES' });

  try {
    const permit = await guard.acquire('site');
    const remove = vi.spyOn(fs, 'rm').mockImplementation(async (filename, options) => {
      if (String(filename) === path.join(root, '.coordination', '.deliveries', 'site')) {
        throw primary;
      }

      return original(filename, options);
    });

    try {
      await expect(permit!.release(true)).rejects.toBe(primary);
    } finally {
      remove.mockRestore();
    }
    expect(await readdir(path.join(root, '.coordination'))).not.toContain('.operation.lock');
    await expect(guard.assertRestorable()).rejects.toMatchObject({ code: 'Conflict' });
    const retry = await guard.acquire('site');

    expect(retry).not.toBeNull();
    await retry!.release(true);
    await expect(guard.assertRestorable()).resolves.toBeUndefined();
  } finally {
    await original(root, { recursive: true, force: true });
  }
});

describe('cross-process restoration and delivery exclusion', () => {
  it('blocks restoration throughout delivery and retains unresolved delivery across adapter instances', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-delivery-'));

    try {
      const first = new FileDeliveryRestoreGuard(root);
      const second = new FileDeliveryRestoreGuard(root);
      const permit = await first.acquire('site');

      expect(permit).not.toBeNull();
      expect(await second.acquire('other')).toBeNull();
      await expect(second.assertRestorable()).rejects.toThrow();
      await permit!.release(false);
      await expect(second.assertRestorable()).rejects.toThrow('Unresolved');
      const recovery = await second.acquire('site');

      await recovery!.release(true);
      await expect(first.assertRestorable()).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
