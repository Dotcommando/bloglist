import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { FileSiteFaviconStore } from '../../src/adapters/outbound/storage/files/media/site-favicon-store.adapter.js';
import { icoFixture as icon } from '../support/favicon.js';

describe('site favicon storage', () => {
  let root: string;
  let store: FileSiteFaviconStore;

  beforeEach(async () => {
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/favicon-store-'));
    store = new FileSiteFaviconStore(root, {
      primaryDomain: async (siteId) => siteId === 'site-1' ? 'first.test' : 'second.test',
    });
  });
  afterEach(async () => {
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps one private icon, exposes accurate metadata and isolates sites', async () => {
    expect(await store.read('site-1')).toBeNull();
    const bytes = await icon(32);
    const details = await store.replace('site-1', assetBinary(bytes, 'image/x-icon'), {
      width: 32, height: 32, aspectRatio: 1,
    });
    const snapshot = await store.read('site-1');

    try {
      expect(snapshot).toMatchObject({ ...details, width: 32, height: 32, byteSize: bytes.length });
      expect(await readFile(path.join(root, 'first.test/.private/favicon.ico'))).toEqual(bytes);
      expect(await readdir(path.join(root, 'first.test/images'))).toEqual([]);
      expect(await store.read('site-2')).toBeNull();
    } finally {
      await snapshot?.dispose();
    }
  });

  it('keeps an opened snapshot stable across replacement and cleans failed writes', async () => {
    const old = await icon(16);
    const next = await icon(48);

    await store.replace('site-1', assetBinary(old, 'image/x-icon'), { width: 16, height: 16, aspectRatio: 1 });
    const snapshot = (await store.read('site-1'))!;

    try {
      const saved = await store.replace('site-1', assetBinary(next, 'image/x-icon'), {
        width: 48, height: 48, aspectRatio: 1,
      });
      const chunks = [];

      for await (const chunk of snapshot.content.bytes) {
        chunks.push(chunk);
      }
      expect(Buffer.concat(chunks)).toEqual(old);
      expect(saved.version).not.toBe(snapshot.version);
      await expect(store.replace('site-1', {
        byteSize: 4,
        mimeType: 'image/x-icon',
        bytes: {
          async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
            yield new Uint8Array([0]);
            throw new Error('stream failed');
          },
        },
      }, { width: 16, height: 16, aspectRatio: 1 })).rejects.toThrow('stream failed');
      expect(await readFile(path.join(root, 'first.test/.private/favicon.ico'))).toEqual(next);
      expect(await readdir(path.join(root, '.favicon-staging'))).toEqual([]);
      expect(await readdir(path.join(root, 'first.test/.private'))).toEqual(['favicon.ico']);
      await store.remove('site-1');
      expect(await store.read('site-1')).toBeNull();
      await store.remove('site-1');
    } finally {
      await snapshot.dispose();
    }
  });
});
