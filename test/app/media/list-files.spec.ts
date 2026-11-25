import { ListMediaFilesUseCase } from '../../../src/app/use-cases/media/list-media-files.use-case.js';
import type { IMediaLibraryStore } from '../../../src/ports/outbound/media/file-library.port.js';
import { libraryFileFixture } from '../../support/file-library.js';

describe('ListMediaFiles', () => {
  it('returns each prepared output size from its own content metadata', async () => {
    const source = libraryFileFixture();
    const variant = {
      variantId: 'small',
      content: { contentId: 'private-variant' },
      mimeType: 'image/webp',
      byteSize: 321,
      checksum: 'variant-hash',
      dimensions: source.image.originalDimensions!,
    };
    const file = {
      ...source,
      image: { ...source.image, variants: [variant] },
      outputs: [...source.outputs, ...['w320', 'w576'].map((key) => ({
        key,
        suffix: '--' + key + '.webp',
        contentId: variant.content.contentId,
        mimeType: variant.mimeType,
        dimensions: variant.dimensions,
      }))],
    };
    const store: IMediaLibraryStore = {
      append: vi.fn(),
      ensureFolder: vi.fn(),
      browse: vi.fn(),
      locate: vi.fn(),
      metadata: vi.fn(),
      status: vi.fn(),
      folder: vi.fn(),
      checkName: vi.fn(),
      discard: vi.fn(),
      changeFile: vi.fn(),
      publicOutput: vi.fn(),
      read: vi.fn(async () => ({
        library: { siteId: 'site-1', version: 'v1', folders: [], files: [file] },
        pending: false,
      })),
      reconcile: vi.fn(),
    };
    const operation = new ListMediaFilesUseCase(store,
      { requireEditor: vi.fn(), actorId: async () => 'admin' }, { nextId: () => 'v2', publicPath: '/media' });
    const result = await operation.execute({ siteId: 'site-1' });

    expect(result.files[0]?.outputs).toEqual([
      {
        key: 'file',
        url: '/media/images/photo.png',
        mimeType: 'image/png',
        dimensions: source.image.originalDimensions,
        byteSize: 20,
      },
      ...['w320', 'w576'].map((key) => ({
        key,
        url: '/media/images/photo--' + key + '.webp',
        mimeType: 'image/webp',
        dimensions: variant.dimensions,
        byteSize: 321,
      })),
    ]);
    expect(JSON.stringify(result)).not.toContain('private-variant');
  });

  it('requires site authorization and exposes an empty site library without private storage references', async () => {
    const requireEditor = vi.fn();
    const store: IMediaLibraryStore = {
      append: vi.fn(),
      ensureFolder: vi.fn(),
      browse: vi.fn(),
      locate: vi.fn(),
      metadata: vi.fn(),
      status: vi.fn(),
      folder: vi.fn(),
      checkName: vi.fn(),
      discard: vi.fn(),
      changeFile: vi.fn(),
      publicOutput: vi.fn(),
      read: vi.fn(async (siteId) => ({ library: { siteId, version: '0', folders: [], files: [] }, pending: false })),
      reconcile: vi.fn(),
    };
    const operation = new ListMediaFilesUseCase(store,
      { requireEditor, actorId: async () => 'admin' }, { nextId: () => 'v1', publicPath: '/media' });

    expect(await operation.execute({ siteId: 'site-1' })).toEqual({
      version: '0', folders: [], files: [], pending: false,
    });
    expect(requireEditor).toHaveBeenCalledWith('site-1');
    requireEditor.mockRejectedValue(new Error('denied'));
    await expect(operation.execute({ siteId: 'foreign' })).rejects.toThrow('denied');
    expect(store.read).toHaveBeenCalledTimes(1);
  });
});
