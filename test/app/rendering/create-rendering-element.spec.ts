import { CompleteElementSaveService } from '../../../src/app/services/rendering/complete-element-save.service.js';
import {
  CreateRenderingElementUseCase,
} from '../../../src/app/use-cases/rendering/create-rendering-element.use-case.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { elementFixture, FakeElementStore } from '../../support/rendering.js';
import { siteFixture } from '../../support/sites.js';

describe('CreateRenderingElement', () => {
  it('authorizes and validates names before consuming an ordinal', async () => {
    const site = { execute: vi.fn(async (): Promise<ReturnType<typeof siteFixture> | null> => siteFixture()) };
    const keys = { reserve: vi.fn(async () => '1') };
    const useCase = new CreateRenderingElementUseCase(site,
      { find: async () => null, list: async () => [] },
      new CompleteElementSaveService(new FakeElementStore(), { write: vi.fn() }, fakeHookChanges),
      { nextId: () => 'id', nextVersion: () => 'v2', now: () => new Date('2026-10-26T01:00:00Z') }, keys);

    await expect(useCase.execute({ ...elementFixture(), name: ' ' })).rejects.toMatchObject({ code: 'Validation' });
    expect(keys.reserve).not.toHaveBeenCalled();
    site.execute.mockResolvedValueOnce(null);
    await expect(useCase.execute(elementFixture())).rejects.toMatchObject({ code: 'NotFound' });
    expect(keys.reserve).not.toHaveBeenCalled();
    expect((await useCase.execute(elementFixture())).key).toBe('1');
  });
  it('assigns a scoped ordinal and persists a separate display name', async () => {
    const store = new FakeElementStore();
    const backup = { write: vi.fn(async () => {}) };
    const keys = { reserve: vi.fn(async () => '8') };
    const useCase = new CreateRenderingElementUseCase({ execute: async () => siteFixture() },
      { find: async () => null, list: async () => [elementFixture({ key: '7' }), elementFixture()] },
      new CompleteElementSaveService(store, backup, fakeHookChanges),
      { nextId: () => 'new-id', nextVersion: () => 'v2', now: () => new Date('2026-10-26T01:00:00Z') }, keys);
    const saved = await useCase.execute({ ...elementFixture(), name: 'Home page' });

    expect(saved).toMatchObject({ key: '8', name: 'Home page', backupState: 'Ready' });
    expect(keys.reserve).toHaveBeenCalledExactlyOnceWith({ siteId: 'site-1', kind: 'Template', after: 7n });
    expect(backup.write).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ key: '8', name: 'Home page' }));
  });
  it('creates a scoped entity and its backup without publishing, and refuses a file-only duplicate', async () => {
    const store = new FakeElementStore();
    const backup = { write: vi.fn(async () => {}) };
    const catalog = {
      find: vi.fn(async (): Promise<ReturnType<typeof elementFixture> | null> => null),
      list: vi.fn(async () => []),
    };
    const values = {
      nextId: () => 'new-id',
      nextVersion: () => 'new-version',
      now: () => new Date('2026-10-26T01:00:00Z'),
    };
    const useCase = new CreateRenderingElementUseCase({ execute: async () => siteFixture() }, catalog,
      new CompleteElementSaveService(store, backup, fakeHookChanges), values, { reserve: async () => '1' });
    const input = elementFixture();
    const saved = await useCase.execute(input);

    expect(saved).toMatchObject({ elementId: 'new-id', version: 'new-version', backupState: 'Ready' });
    expect(backup.write).toHaveBeenCalledTimes(1);
    catalog.find.mockResolvedValueOnce(input);
    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'Conflict' });
  });
  it('reports the persisted entity as pending on backup failure, never a completed save', async () => {
    const store = new FakeElementStore();
    const useCase = new CreateRenderingElementUseCase({ execute: async () => siteFixture() },
      { find: async () => null, list: async () => [] },
      new CompleteElementSaveService(store, {
        write: async () => {
          throw new Error('Disk unavailable');
        },
      }, fakeHookChanges),
      { nextId: () => 'id', nextVersion: () => 'v2', now: () => new Date('2026-10-26T01:00:00Z') },
      { reserve: async () => '1' });
    const saved = await useCase.execute(elementFixture());

    expect(saved.backupState).toBe('Pending');
    expect(await store.find(saved)).toMatchObject({ version: 'v2', backupState: 'Pending' });
  });
});
