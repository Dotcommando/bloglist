import { DeleteMediaFileUseCase } from '../../../src/app/use-cases/media/delete-media-file.use-case.js';
import { GetMediaUsagesUseCase } from '../../../src/app/use-cases/media/get-media-usages.use-case.js';
import { MoveMediaFileUseCase } from '../../../src/app/use-cases/media/move-media-file.use-case.js';
import { UploadMediaFileUseCase } from '../../../src/app/use-cases/media/upload-media-file.use-case.js';
import { ImageUploadMode } from '../../../src/domain/media/file-library.js';
import { MediaUsageGroup, MediaUsageTargetKind } from '../../../src/domain/media/file-library.js';
import { fileLibraryFixture, type IFileLibraryFixture, libraryFileFixture } from '../../support/file-library.js';
import { binary } from '../../support/media.js';

describe('file organization and deliberate broken links', () => {
  it('accepts copied upload filenames and rejects invalid names before preparation', async () => {
    const f = fileLibraryFixture();
    const image = libraryFileFixture();
    const prepare = { prepare: vi.fn(async () => ({ image: image.image, outputs: image.outputs })) };
    const operation = new UploadMediaFileUseCase(f.service, prepare);
    const input = {
      siteId: 'site-1',
      expectedVersion: 'v1',
      filename: 'photo (2).png',
      folderId: null,
      mode: ImageUploadMode.Original,
      content: binary('fake', 'image/png'),
    };

    await expect(operation.execute({ ...input, filename: 'bad?.png' })).rejects.toMatchObject({
      issue: 'FileInvalidName',
    });
    expect(prepare.prepare).not.toHaveBeenCalled();
    expect((await operation.execute(input)).files[0]?.name).toBe('photo (2).png');
  });
  function fixture(): IFileLibraryFixture {
    const f = fileLibraryFixture();

    f.set({
      ...f.get(),
      folders: [{ folderId: 'folder', parentId: null, name: 'Photos' }],
      files: [{ ...libraryFileFixture(), name: 'old.png' }],
    });

    return f;
  }

  it('moves and renames the image and all output names, retaining old paths for usage discovery', async () => {
    const f = fixture();
    const result = await new MoveMediaFileUseCase(f.service).execute({
      siteId: 'site-1',
      fileId: 'image',
      expectedVersion: 'v1',
      folderId: 'folder',
      name: 'new.png',
    });

    expect(result.files[0]?.outputs[0]?.url).toBe('/media/images/Photos/new.png');
    expect(f.get().files[0]?.previousPaths).toEqual(['/media/images/old.png']);
  });

  it('rewrites each current output URL only when explicitly requested after a successful move', async () => {
    const f = fixture();
    const references = { replace: vi.fn(async () => undefined) };
    const operation = new MoveMediaFileUseCase(f.service, references, { execute: async () => null });

    await operation.execute({
      siteId: 'site-1',
      fileId: 'image',
      expectedVersion: 'v1',
      folderId: 'folder',
      name: 'new.png',
      updateReferences: true,
    });
    expect(references.replace).toHaveBeenCalledWith('site-1', [
      { from: '/media/images/old.png', to: '/media/images/Photos/new.png' },
    ]);
    expect(f.get().files[0]?.name).toBe('new.png');
  });

  it('retains publication work after source replacement and retries without another move', async () => {
    const f = fixture();
    const references = { replace: vi.fn(async () => {}) };
    const publication = {
      execute: vi.fn(async () => {
        expect(references.replace).toHaveBeenCalled();

        return null;
      }),
    };
    const operation = new MoveMediaFileUseCase(f.service, references, publication);
    const input = {
      siteId: 'site-1',
      fileId: 'image',
      expectedVersion: 'v1',
      folderId: 'folder',
      name: 'new.png',
      updateReferences: true,
    };

    publication.execute.mockRejectedValueOnce(new Error('activation rejected'));
    const moved = await operation.execute(input);

    expect(moved.referenceUpdate).toBe('Pending');
    expect(moved.files[0]?.referencesPending).toBe(true);
    const { revision } = f.get().files[0]!;

    await operation.retry(input);
    expect(publication.execute).toHaveBeenCalledTimes(2);
    expect(references.replace).toHaveBeenCalledTimes(2);
    expect(f.get().files[0]?.revision).toBe(revision);
    await operation.retry(input);
    expect(publication.execute).toHaveBeenCalledTimes(2);
  });

  it('repairs historical output references on a later rename and on retry after a source failure', async () => {
    const f = fixture();
    const references = { replace: vi.fn(async () => undefined) };
    const operation = new MoveMediaFileUseCase(f.service, references, { execute: async () => null });

    f.set({
      ...f.get(),
      files: [{ ...f.get().files[0]!, previousPaths: ['/media/images/original.png'] }],
    });
    await operation.execute({
      siteId: 'site-1',
      fileId: 'image',
      expectedVersion: 'v1',
      folderId: 'folder',
      name: 'new.png',
      updateReferences: true,
    });
    expect(references.replace).toHaveBeenCalledWith('site-1', expect.arrayContaining([
      { from: '/media/images/original.png', to: '/media/images/Photos/new.png' },
      { from: '/media/images/old.png', to: '/media/images/Photos/new.png' },
    ]));
    expect(references.replace).toHaveBeenCalledTimes(1);
    references.replace.mockRejectedValueOnce(new Error('source conflict'));
    await expect(operation.execute({
      siteId: 'site-1',
      fileId: 'image',
      expectedVersion: f.get().version,
      folderId: 'folder',
      name: 'final.png',
      updateReferences: true,
    })).resolves.toMatchObject({ referenceUpdate: 'Pending' });
    await operation.retry({ siteId: 'site-1', fileId: 'image' });
    expect(references.replace).toHaveBeenLastCalledWith('site-1', expect.arrayContaining([
      { from: '/media/images/original.png', to: '/media/images/Photos/final.png' },
      { from: '/media/images/old.png', to: '/media/images/Photos/final.png' },
      { from: '/media/images/Photos/new.png', to: '/media/images/Photos/final.png' },
    ]));
  });

  it('preserves historical paths that now belong to another named file', async () => {
    const f = fixture();
    const current = f.get().files[0]!;
    const reused = { ...libraryFileFixture(), fileId: 'other', name: 'reused.png' };

    f.set({ ...f.get(), files: [{ ...current, previousPaths: ['/media/images/reused.png'] }, reused] });
    const references = { replace: vi.fn(async () => {}) };

    await new MoveMediaFileUseCase(f.service, references, { execute: async () => null }).execute({
      siteId: 'site-1',
      fileId: 'image',
      expectedVersion: 'v1',
      folderId: 'folder',
      name: 'new.png',
      updateReferences: true,
    });
    expect(references.replace).toHaveBeenCalledWith('site-1', [
      { from: '/media/images/old.png', to: '/media/images/Photos/new.png' },
    ]);
  });

  it('keeps references by default and never rewrites after a rejected move', async () => {
    const f = fixture();
    const references = { replace: vi.fn(async () => undefined) };
    const operation = new MoveMediaFileUseCase(f.service, references, { execute: async () => null });

    await expect(operation.execute({
      siteId: 'site-1',
      fileId: 'image',
      expectedVersion: 'wrong',
      folderId: 'folder',
      name: 'new.png',
      updateReferences: true,
    })).rejects.toMatchObject({ code: 'StaleWrite' });
    expect(references.replace).not.toHaveBeenCalled();
    await operation.execute({
      siteId: 'site-1', fileId: 'image', expectedVersion: 'v1', folderId: 'folder', name: 'new.png',
    });
    expect(references.replace).not.toHaveBeenCalled();
  });

  it('reports movement separately from a rejected reference save', async () => {
    const f = fixture();
    const references = {
      replace: vi.fn(async () => {
        throw new Error('reference save failed');
      }),
    };

    await expect(new MoveMediaFileUseCase(f.service, references, { execute: async () => null }).execute({
      siteId: 'site-1',
      fileId: 'image',
      expectedVersion: 'v1',
      folderId: 'folder',
      name: 'new.png',
      updateReferences: true,
    })).resolves.toMatchObject({ referenceUpdate: 'Pending', files: [{ referencesPending: true }] });
  });

  it('shows usages; normal delete refuses used images; Force delete skips server usage and review checks', async () => {
    const f = fixture();
    const usage = {
      group: MediaUsageGroup.Content,
      title: 'Home',
      field: 'contentMd',
      target: { kind: MediaUsageTargetKind.Page, id: 'home' },
      state: 'Draft',
    };

    f.usages.find.mockResolvedValue([usage]);
    expect(await new GetMediaUsagesUseCase(f.service).execute({
      siteId: 'site-1', fileId: 'image', expectedVersion: 'v1',
    }))
      .toMatchObject({ usages: [usage] });
    const operation = new DeleteMediaFileUseCase(f.service);

    await expect(operation.execute({ siteId: 'site-1', fileId: 'image', expectedVersion: 'v1', force: false }))
      .rejects.toMatchObject({ code: 'Conflict' });
    f.usages.find.mockClear();
    const result = await operation.execute({ siteId: 'site-1', fileId: 'image', expectedVersion: 'v1', force: true });

    expect(result.files).toEqual([]);
    expect(f.usages.find).not.toHaveBeenCalled();
  });

  it('denies access before resolving a file and does not expose a foreign file', async () => {
    const f = fixture();
    const operation = new GetMediaUsagesUseCase(f.service);

    await expect(operation.execute({ siteId: 'site-1', fileId: 'foreign', expectedVersion: 'v1' }))
      .rejects.toMatchObject({ code: 'NotFound' });
    f.access.requireEditor.mockRejectedValue(new Error('denied'));
    await expect(operation.execute({ siteId: 'other-site', fileId: 'image', expectedVersion: 'v1' }))
      .rejects.toThrow('denied');
  });
});
