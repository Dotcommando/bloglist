import { ReadPublicMediaUseCase } from '../../../src/app/use-cases/media/read-public-media.use-case.js';
import type { IResolveSite } from '../../../src/ports/inbound/sites/resolve-site.port.js';
import { fileLibraryFixture, libraryFileFixture } from '../../support/file-library.js';
import { mediaFixture } from '../../support/media.js';
import { siteFixture } from '../../support/sites.js';

describe('public named media', () => {
  it('serves the current site favicon independently of the named library', async () => {
    const f = fileLibraryFixture();
    const { storage } = mediaFixture();
    const icon = {
      content: { byteSize: 0, mimeType: 'image/x-icon', bytes: (async function* (): AsyncGenerator<Uint8Array> {})() },
      byteSize: 0,
      width: 32,
      height: 32,
      version: 'v1',
      dispose: vi.fn(async () => {}),
    };
    const read = vi.fn(async () => icon);
    const sites: IResolveSite = { execute: async ({ hostname }) => hostname === 'example.test' ? siteFixture() : null };
    const operation = new ReadPublicMediaUseCase(sites, f.store, storage, '/media', {
      read,
      remove: async () => {},
      replace: async () => {
        throw new Error('unused');
      },
    });

    f.store.read = vi.fn(f.store.read);
    expect(await operation.execute({ hostname: 'unknown.test', path: '/favicon.ico' })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    const result = await operation.execute({ hostname: 'example.test', path: '/favicon.ico' });

    expect(result).toMatchObject({ content: icon.content, etag: '"v1"' });
    expect(read).toHaveBeenCalledWith(siteFixture().siteId);
    expect(f.store.read).not.toHaveBeenCalled();
    await result!.dispose!();
    expect(icon.dispose).toHaveBeenCalledOnce();
  });

  it('resolves a trusted host, denies foreign paths and returns 404 after deletion', async () => {
    const f = fileLibraryFixture();

    f.set({ ...f.get(), files: [libraryFileFixture()] });
    const { storage } = mediaFixture();

    storage.read = vi.fn(storage.read);
    const sites: IResolveSite = {
      execute: async ({ hostname }) => hostname === 'example.test' ? siteFixture() : null,
    };
    const operation = new ReadPublicMediaUseCase(sites, f.store, storage, '/media', {
      read: async () => null,
      remove: async () => {},
      replace: async () => {
        throw new Error('unused');
      },
    });

    expect(await operation.execute({ hostname: 'unknown.test', path: '/media/images/photo.png' })).toBeNull();
    expect(await operation.execute({ hostname: 'example.test', path: '/media/files/foreign/photo.png' })).toBeNull();
    expect(storage.read).not.toHaveBeenCalled();
    expect(await operation.execute({ hostname: 'example.test', path: '/media/images/photo.png' }))
      .toMatchObject({ etag: '"asset-v1-file"' });
    f.set({ ...f.get(), files: [] });
    expect(await operation.execute({ hostname: 'example.test', path: '/media/images/photo.png' })).toBeNull();
  });
});
