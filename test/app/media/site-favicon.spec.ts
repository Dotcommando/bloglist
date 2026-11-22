import { GetSiteFaviconUseCase } from '../../../src/app/use-cases/media/get-site-favicon.use-case.js';
import { UploadSiteFaviconUseCase } from '../../../src/app/use-cases/media/upload-site-favicon.use-case.js';
import type { IBinaryContent } from '../../../src/domain/shared/binary-content.js';

const content: IBinaryContent = {
  byteSize: 3,
  mimeType: 'image/x-icon',
  bytes: {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1, 2, 3]);
    },
  },
};

describe('UploadSiteFavicon', () => {
  it('inspects only ICO files, replaces the current icon and always releases inspected content', async () => {
    const details = { byteSize: 3, width: 32, height: 32, version: 'new-icon' };
    const store = { remove: vi.fn(), read: vi.fn(), replace: vi.fn(async () => details) };
    const inspected = {
      content,
      checksum: 'hash',
      dimensions: { width: 32, height: 32, aspectRatio: 1 },
      dispose: vi.fn(async () => {}),
    };
    const inspection = { inspect: vi.fn(async () => inspected) };
    const access = { requireEditor: vi.fn(async () => {}) };
    const publication = { execute: vi.fn(async () => null) };
    const operation = new UploadSiteFaviconUseCase(store, access, inspection, publication);

    expect(await operation.execute({ siteId: 'site-1', filename: 'new.ICO', content })).toEqual(details);
    expect(store.replace).toHaveBeenCalledWith('site-1', content, inspected.dimensions);
    expect(publication.execute).toHaveBeenCalledWith({ siteId: 'site-1', paths: [], favicon: details });
    expect(inspected.dispose).toHaveBeenCalledTimes(1);
    await expect(operation.execute({ siteId: 'site-1', filename: 'image.png', content }))
      .rejects.toMatchObject({ issue: 'FileUnsupportedFormat' });
    expect(inspection.inspect).toHaveBeenCalledTimes(1);
    store.replace.mockRejectedValue(new Error('write failed'));
    await expect(operation.execute({ siteId: 'site-1', filename: 'icon.ico', content }))
      .rejects.toThrow('write failed');
    expect(inspected.dispose).toHaveBeenCalledTimes(2);
    access.requireEditor.mockRejectedValue(new Error('denied'));
    await expect(operation.execute({ siteId: 'foreign', filename: 'icon.ico', content })).rejects.toThrow('denied');
    expect(inspection.inspect).toHaveBeenCalledTimes(2);
    access.requireEditor.mockResolvedValueOnce(undefined);
    store.replace.mockResolvedValueOnce(details);
    publication.execute.mockRejectedValueOnce(new Error('activation rejected'));
    await expect(operation.execute({ siteId: 'site-1', filename: 'icon.ico', content }))
      .rejects.toThrow('activation rejected');
    expect(inspected.dispose).toHaveBeenCalledTimes(3);
  });
});

describe('GetSiteFavicon', () => {
  it('authorizes the site, returns metadata only and releases the snapshot', async () => {
    const icon = { byteSize: 3, width: 32, height: 32, version: 'icon-v1', content, dispose: vi.fn(async () => {}) };
    const store = { remove: vi.fn(), read: vi.fn(async () => icon), replace: vi.fn() };
    const access = { requireEditor: vi.fn(async () => {}) };
    const operation = new GetSiteFaviconUseCase(store, access);

    expect(await operation.execute({ siteId: 'site-1' })).toEqual({
      byteSize: 3, width: 32, height: 32, version: 'icon-v1',
    });
    expect(store.read).toHaveBeenCalledWith('site-1');
    expect(icon.dispose).toHaveBeenCalledTimes(1);
    access.requireEditor.mockRejectedValue(new Error('denied'));
    await expect(operation.execute({ siteId: 'foreign' })).rejects.toThrow('denied');
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it('returns null when absent and observes failed snapshot cleanup', async () => {
    const store = { remove: vi.fn(), read: vi.fn(), replace: vi.fn() };
    const operation = new GetSiteFaviconUseCase(store, { requireEditor: async () => {} });

    store.read.mockResolvedValue(null);
    expect(await operation.execute({ siteId: 'site-1' })).toBeNull();
    store.read.mockResolvedValue({
      byteSize: 3,
      width: 32,
      height: 32,
      version: 'icon-v1',
      content,
      dispose: vi.fn(async () => {
        throw new Error('cleanup failed');
      }),
    });
    await expect(operation.execute({ siteId: 'site-1' })).rejects.toThrow('cleanup failed');
  });
});
