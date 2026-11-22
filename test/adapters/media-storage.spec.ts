import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

import { AssetInspectionAdapter } from '../../src/adapters/outbound/media/sharp/asset-inspection.adapter.js';
import { FileAssetStorageAdapter } from '../../src/adapters/outbound/storage/files/media/asset-storage.adapter.js';
import { AssetVisibility } from '../../src/domain/media/asset.js';
import type { IBinaryContent, IContentReference } from '../../src/domain/shared/binary-content.js';
import type { IInspectedAsset } from '../../src/ports/outbound/media/asset-inspection.port.js';
import { AssetContentRole } from '../../src/ports/outbound/media/asset-storage.port.js';
import { binary } from '../support/media.js';

async function content(bytes: Uint8Array, mimeType = 'application/octet-stream'): Promise<IBinaryContent> {
  return {
    bytes: (async function* () {
      yield bytes;
    })(),
    byteSize: 1,
    mimeType,
  };
}

describe('actual-content upload inspection', () => {
  const adapter = new AssetInspectionAdapter();
  const resources: IInspectedAsset[] = [];
  const inspect = {
    inspect: async (...args: Parameters<AssetInspectionAdapter['inspect']>): Promise<IInspectedAsset> => {
      const result = await adapter.inspect(...args);

      resources.push(result);

      return result;
    },
  };

  afterEach(async () => {
    await Promise.all(resources.splice(0).map((result) => result.dispose?.()));
  });

  it('detects actual format and size rather than trusting declarations', async () => {
    const bytes = await sharp({ create: { width: 10, height: 20, channels: 4, background: '#f00' } }).png().toBuffer();
    const result = await inspect.inspect('photo.png', await content(bytes, 'text/html'));

    expect(result.content).toMatchObject({ mimeType: 'image/png', byteSize: bytes.length });
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
  it('rejects disguised content, oversized streams and active SVG', async () => {
    await expect(inspect.inspect('photo.jpg', binary('<html>fake</html>'))).rejects.toThrow();
    await expect(inspect.inspect('../photo.png', binary('x'))).rejects.toThrow();
    await expect(inspect.inspect('bad.svg', binary('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>')))
      .rejects.toThrow();
    await expect(inspect.inspect('big.png', await content(new Uint8Array(20 * 1024 * 1024 + 1))))
      .rejects.toThrow();
  });
  it('accepts passive SVG and CSV attachments', async () => {
    expect((await inspect.inspect('logo.svg', binary('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><path d="M0 0"/></svg>')))
      .content.mimeType).toBe('image/svg+xml');
    expect((await inspect.inspect('data.csv', binary('name,number\nA,1\n'))).content.mimeType).toBe('text/csv');
  });
});

describe('filesystem object storage', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'zarya-media-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it('round-trips public WOFF2 references whose extension contains a digit', async () => {
    const store = new FileAssetStorageAdapter(root, '/assets', { primaryDomain: async () => 'example.test' });
    const ref = await store.write({
      siteId: 'site',
      assetId: 'font',
      assetVersion: 'v1',
      variantId: 'original',
      role: AssetContentRole.Derivative,
      visibility: AssetVisibility.Public,
      content: binary('synthetic-font', 'font/woff2'),
    });

    expect((await store.read('site', ref))?.mimeType).toBe('font/woff2');
    expect(await store.publicUrl('site', ref)).toContain('/assets/files/.objects/font/v1/original.woff2');
    await expect(store.read('other', ref)).rejects.toThrow();
  });

  it('writes immutable private originals and scopes all operations by site', async () => {
    const store = new FileAssetStorageAdapter(root, '/media', { primaryDomain: async () => 'example.test' });
    const ref = await store.write({
      siteId: 'site',
      assetId: 'asset',
      assetVersion: 'v1',
      role: AssetContentRole.Original,
      visibility: AssetVisibility.Private,
      content: binary('original'),
    });

    expect(await store.read('site', ref)).not.toBeNull();
    await expect(store.read('other', ref)).rejects.toThrow();
    await expect(store.publicUrl('site', ref)).rejects.toThrow();
    await expect(store.read('site', { contentId: '../outside' })).rejects.toThrow();
    await expect(store.write({
      siteId: '../site',
      assetId: 'asset',
      assetVersion: 'v1',
      role: AssetContentRole.Original,
      visibility: AssetVisibility.Private,
      content: binary('x'),
    })).rejects.toThrow();
  });
  it('reuses identical logical writes, rejects different bytes and exposes only public objects', async () => {
    const store = new FileAssetStorageAdapter(root, '/media', { primaryDomain: async () => 'example.test' });
    const write = (value: string): Promise<IContentReference> => store.write({
      siteId: 'site',
      assetId: 'asset',
      assetVersion: 'v1',
      variantId: 'w320',
      role: AssetContentRole.Derivative,
      visibility: AssetVisibility.Public,
      content: binary(value),
    });
    const ref = await write('first');

    expect(await write('first')).toEqual(ref);
    await expect(write('different')).rejects.toThrow();
    expect(await store.publicUrl('site', ref)).toContain('/media/images/.objects/asset/v1/');
    await store.delete('site', ref);
    expect(await store.read('site', ref)).toBeNull();
  });
});
