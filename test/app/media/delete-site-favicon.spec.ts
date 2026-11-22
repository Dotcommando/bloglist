import { DeleteSiteFaviconUseCase } from '../../../src/app/use-cases/media/delete-site-favicon.use-case.js';

it('authorizes removal before storage, updates published HTML and propagates rejected work', async () => {
  const store = { remove: vi.fn(async () => {}) };
  const access = { requireEditor: vi.fn(async () => {}) };
  const publication = {
    execute: vi.fn(async () => {
      expect(store.remove).toHaveBeenCalledWith('site-1');

      return null;
    }),
  };
  const operation = new DeleteSiteFaviconUseCase(store, access, publication);

  await operation.execute({ siteId: 'site-1' });
  expect(publication.execute).toHaveBeenCalledWith({ siteId: 'site-1', paths: [], favicon: null });
  access.requireEditor.mockRejectedValueOnce(new Error('denied'));
  await expect(operation.execute({ siteId: 'foreign' })).rejects.toThrow('denied');
  expect(store.remove).toHaveBeenCalledTimes(1);
  store.remove.mockRejectedValueOnce(new Error('remove failed'));
  await expect(operation.execute({ siteId: 'site-1' })).rejects.toThrow('remove failed');
  expect(publication.execute).toHaveBeenCalledTimes(1);
  publication.execute.mockRejectedValueOnce(new Error('activation failed'));
  await expect(operation.execute({ siteId: 'site-1' })).rejects.toThrow('activation failed');
});
