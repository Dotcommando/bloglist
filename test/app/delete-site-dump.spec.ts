import { DeleteSiteDumpUseCase } from '../../src/app/use-cases/dumps/delete-site-dump.use-case.js';

describe('delete site dump', () => {
  it('authorizes before deleting only the selected archive and rejects unsafe filenames', async () => {
    const store = { delete: vi.fn(async () => {}) };
    const access = { requireAdministrator: vi.fn(async () => {}) };
    const operation = new DeleteSiteDumpUseCase(store, access);
    const input = {
      siteId: 'site-1',
      actorId: 'admin',
      filename: '2026-10-29T12-00-00-000Z_11111111-1111-4111-8111-111111111111.jsonl.gz',
    };

    await operation.execute(input);
    expect(store.delete).toHaveBeenCalledWith(input.siteId, input.filename);
    access.requireAdministrator.mockRejectedValueOnce(new Error('denied'));
    await expect(operation.execute(input)).rejects.toThrow('denied');
    await expect(operation.execute({ ...input, filename: '../foreign.gz' }))
      .rejects.toMatchObject({ code: 'Validation' });
    expect(store.delete).toHaveBeenCalledTimes(1);
  });
});
