import { CreateSiteDumpUseCase } from '../../src/app/use-cases/dumps/create-site-dump.use-case.js';
import { GetSiteDumpUseCase } from '../../src/app/use-cases/dumps/get-site-dump.use-case.js';
import { ImportSiteDumpUseCase } from '../../src/app/use-cases/dumps/import-site-dump.use-case.js';
import { ListSiteDumpsUseCase } from '../../src/app/use-cases/dumps/list-site-dumps.use-case.js';
import { RestoreSiteDumpUseCase } from '../../src/app/use-cases/dumps/restore-site-dump.use-case.js';
import { SiteDumpType } from '../../src/domain/dumps/site-dump.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../src/ports/outbound/dumps/site-dump-store.port.js';
import { fakeHookChanges } from '../support/hooks.js';

describe('site dump operations', () => {
  const input = { siteId: 'site-1', actorId: 'admin' };
  const filename = '2026-10-29T12-00-00-000Z_11111111-1111-4111-8111-111111111111.jsonl.gz';
  const dump = { type: SiteDumpType.Site, filename, byteSize: 1234, createdAt: new Date('2026-10-29T12:00:00Z') };
  const content = { byteSize: 1, mimeType: 'application/gzip', bytes: (async function* () {})() };

  function fixture(): { access: ISiteDumpAccess; store: ISiteDumpStore } {
    const access = { requireAdministrator: vi.fn(async () => {}) };
    const store = {
      create: vi.fn(async () => dump),
      list: vi.fn(async () => [dump]),
      open: vi.fn(async () => ({ ...dump, content })),
      import: vi.fn(async () => dump),
      restore: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      exportItems: vi.fn(),
      inspect: vi.fn(),
    };

    return { access, store };
  }

  it('authorizes every operation before touching archives and preserves trusted site scope', async () => {
    const { access, store } = fixture();

    expect(await new CreateSiteDumpUseCase(store, access).execute(input)).toEqual(dump);
    expect(await new ListSiteDumpsUseCase(store, access).execute(input)).toEqual([dump]);
    expect(await new GetSiteDumpUseCase(store, access).execute({ ...input, filename })).toMatchObject(dump);
    expect(await new ImportSiteDumpUseCase(store, access).execute({ ...input, content })).toEqual(dump);
    await new RestoreSiteDumpUseCase(store, access, fakeHookChanges).execute({ ...input, filename });
    expect(vi.mocked(access.requireAdministrator).mock.calls)
      .toEqual(['create', 'list', 'download', 'import', 'restore'].map((action) =>
        ['site-1', 'admin', 'cms.dumps.' + action]));
    expect(store.restore).toHaveBeenCalledWith('site-1', filename, undefined, 'admin',
      expect.objectContaining({ siteId: 'site-1' }));
    expect(store.import).toHaveBeenCalledWith('site-1', content);
  });

  it('rejects broader capture and partial application before accessing storage for SiteAdmin', async () => {
    const { access, store } = fixture();

    vi.mocked(access.requireAdministrator).mockResolvedValue(SiteDumpType.Site);
    await expect(new CreateSiteDumpUseCase(store, access).execute({
      ...input, options: { type: SiteDumpType.Addons, itemIds: ['events'] },
    })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(new RestoreSiteDumpUseCase(store, access, fakeHookChanges).execute({
      ...input, filename, options: { version: 'review', choices: [] },
    })).rejects.toMatchObject({ code: 'Forbidden' });
    expect(store.create).not.toHaveBeenCalled();
    expect(store.restore).not.toHaveBeenCalled();
  });

  it('rejects unsafe archive names and unauthorized restores without side effects', async () => {
    const { access, store } = fixture();

    await expect(new RestoreSiteDumpUseCase(store, access, fakeHookChanges).execute({
      ...input,
      filename:
      '../other.gz',
    }))
      .rejects.toMatchObject({ code: 'Validation' });
    vi.mocked(access.requireAdministrator).mockRejectedValueOnce(new Error('denied'));
    await expect(new RestoreSiteDumpUseCase(store, access, fakeHookChanges).execute({
      ...input,
      filename,
    })).rejects.toThrow('denied');
    expect(store.restore).not.toHaveBeenCalled();
  });
});
