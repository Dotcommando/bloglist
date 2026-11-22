import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  SiteAssetDirectoryAdapter,
} from '../../src/adapters/outbound/storage/files/media/site-asset-directory.adapter.js';

describe('domain-owned asset directories', () => {
  it('relocates the whole directory and retains ownership across a domain change', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-domain-storage-'));
    let domain = 'first.test';
    const directories = new SiteAssetDirectoryAdapter(root, { primaryDomain: async () => domain });

    try {
      const first = await directories.resolve('site-1');

      expect(first).toBe(path.join(root, 'first.test'));
      await writeFile(path.join(first, 'images', 'photo.webp'), 'image');
      await writeFile(path.join(first, 'files', 'data.json'), '{}');
      await writeFile(path.join(first, '.private', 'original'), 'original');
      domain = 'second.test';
      await directories.synchronize('site-1');
      expect(await readFile(path.join(root, domain, 'images/photo.webp'), 'utf8')).toBe('image');
      expect(await readFile(path.join(root, domain, 'files/data.json'), 'utf8')).toBe('{}');
      expect(await readFile(path.join(root, domain, '.private/original'), 'utf8')).toBe('original');
      await expect(readFile(path.join(first, 'images/photo.webp'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await directories.resolve('site-1')).toBe(path.join(root, domain));
      await expect(directories.resolve('site-2')).rejects.toThrow('another site');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('serializes relocation with active writers and recovers a completed rename with an old index', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-domain-writer-'));
    let domain = 'old.test';
    const directories = new SiteAssetDirectoryAdapter(root, { primaryDomain: async () => domain });

    try {
      await directories.withWrite('site-1', async (directory) => {
        domain = 'new.test';
        await expect(directories.synchronize('site-1')).rejects.toThrow('writer');
        await writeFile(path.join(directory, 'images', 'late.webp'), 'complete');
      });
      await directories.synchronize('site-1');
      await writeFile(path.join(root, '.storage-index/site-1.json'), JSON.stringify('old.test'));
      expect(await directories.resolve('site-1')).toBe(path.join(root, 'new.test'));
      expect(await readFile(path.join(root, 'new.test/images/late.webp'), 'utf8')).toBe('complete');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
