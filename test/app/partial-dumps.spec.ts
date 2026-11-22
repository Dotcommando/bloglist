import { CreateSiteDumpUseCase } from '../../src/app/use-cases/dumps/create-site-dump.use-case.js';
import { RestoreSiteDumpUseCase } from '../../src/app/use-cases/dumps/restore-site-dump.use-case.js';
import { SiteDumpType } from '../../src/domain/dumps/site-dump.js';
import type { ISiteDumpStore } from '../../src/ports/outbound/dumps/site-dump-store.port.js';
import { fakeHookChanges } from '../support/hooks.js';

describe('partial dump application contracts', () => {
  it('rejects empty item selections and choices on an all-files export', async () => {
    const access = { requireAdministrator: vi.fn(async () => {}) };
    const store: ISiteDumpStore = {
      create: vi.fn(),
      list: vi.fn(),
      open: vi.fn(),
      import: vi.fn(),
      restore: vi.fn(),
      delete: vi.fn(),
      exportItems: vi.fn(),
      inspect: vi.fn(),
    };
    const input = { siteId: 'site-1', actorId: 'admin' };
    const create = new CreateSiteDumpUseCase(store, access);

    await expect(create.execute({ ...input, options: { type: SiteDumpType.Chunks, itemIds: [] } }))
      .rejects.toMatchObject({ code: 'Validation' });
    await expect(create.execute({ ...input, options: { type: SiteDumpType.Files, itemIds: ['chunk-1'] } }))
      .rejects.toMatchObject({ code: 'Validation' });
    expect(store.create).not.toHaveBeenCalled();
  });

  it('passes only the explicitly selected import items and their captured review', async () => {
    const access = { requireAdministrator: vi.fn(async () => {}) };
    const store: ISiteDumpStore = {
      create: vi.fn(),
      list: vi.fn(),
      open: vi.fn(),
      import: vi.fn(),
      restore: vi.fn(),
      delete: vi.fn(),
      exportItems: vi.fn(),
      inspect: vi.fn(),
    };
    const input = {
      siteId: 'target',
      actorId: 'admin',
      filename: '2026-10-29T12-00-00-000Z_11111111-1111-4111-8111-111111111111.jsonl.gz',
      options: { version: 'review-1', choices: [{ id: 'chunk-1', targetId: 'existing-1' }] },
    };

    await new RestoreSiteDumpUseCase(store, access, fakeHookChanges).execute(input);
    expect(store.restore).toHaveBeenCalledWith('target', input.filename, input.options, 'admin',
      expect.objectContaining({ siteId: 'target' }));
  });
});
