import { CreateMediaFolderUseCase } from '../../../src/app/use-cases/media/create-media-folder.use-case.js';
import { fileLibraryFixture } from '../../support/file-library.js';

describe('CreateMediaFolder', () => {
  it('creates nested folders and rejects collisions, unknown parents and stale versions', async () => {
    const f = fileLibraryFixture();
    const operation = new CreateMediaFolderUseCase(f.service);
    const root = await operation.execute({ siteId: 'site-1', expectedVersion: 'v1', name: 'Photos', parentId: null });

    expect(root.folders[0]?.name).toBe('Photos');
    await expect(operation.execute({ siteId: 'site-1', expectedVersion: root.version, name: 'photos', parentId: null }))
      .rejects.toMatchObject({ code: 'Conflict' });
    await expect(operation.execute({
      siteId: 'site-1', expectedVersion: root.version, name: 'Child', parentId: 'foreign',
    }))
      .rejects.toMatchObject({ code: 'Validation' });
    await expect(operation.execute({ siteId: 'site-1', expectedVersion: 'v1', name: 'Other', parentId: null }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
  });
});
