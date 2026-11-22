import { CompleteElementSaveService } from '../../../src/app/services/rendering/complete-element-save.service.js';
import {
  UpdateRenderingElementUseCase,
} from '../../../src/app/use-cases/rendering/update-rendering-element.use-case.js';
import { ElementBackupState } from '../../../src/domain/rendering/rendering-element.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { elementFixture, FakeElementStore } from '../../support/rendering.js';
import { siteFixture } from '../../support/sites.js';

describe('UpdateRenderingElement', () => {
  it('does not overwrite a version saved between catalog capture and persistence lookup', async () => {
    const item = elementFixture();
    const store = new FakeElementStore();

    await store.save({ ...item, version: 'concurrent' }, null);
    const useCase = new UpdateRenderingElementUseCase({ execute: async () => siteFixture() },
      { find: async () => item, list: vi.fn() }, store,
      new CompleteElementSaveService(store, { write: vi.fn() }, fakeHookChanges),
      { nextId: () => 'id', nextVersion: () => 'v2', now: () => new Date('2026-10-26T01:00:00Z') });

    await expect(useCase.execute({ ...item, expectedVersion: 'v1' })).rejects.toMatchObject({ code: 'Conflict' });
    expect((await store.find(item))?.version).toBe('concurrent');
  });
  it('adopts a captured file entity, rejects stale input and repairs pending identical content', async () => {
    const item = elementFixture();
    const store = new FakeElementStore();
    const backup = { write: vi.fn(async () => {}) };
    const values = { nextId: () => 'id', nextVersion: () => 'v2', now: () => new Date('2026-10-26T01:00:00Z') };
    const catalog = { find: async () => (await store.find(item)) ?? item, list: vi.fn() };
    const useCase = new UpdateRenderingElementUseCase({ execute: async () => siteFixture() }, catalog, store,
      new CompleteElementSaveService(store, backup, fakeHookChanges), values);
    const input = { ...item, name: 'Renamed home', html: '<html>Updated</html>', expectedVersion: 'v1' };
    const saved = await useCase.execute(input);

    expect(saved).toMatchObject({ key: item.key, name: 'Renamed home', version: 'v2', backupState: 'Ready' });
    await expect(useCase.execute(input)).rejects.toMatchObject({ code: 'Conflict' });
    store.records.set(store.key(item), { ...saved, backupState: ElementBackupState.Pending });
    await expect(useCase.execute({ ...saved, name: 'Another name', expectedVersion: 'v2' }))
      .rejects.toMatchObject({ code: 'Conflict' });
    expect((await useCase.execute({ ...saved, expectedVersion: 'v2' })).backupState).toBe('Ready');
    expect(backup.write).toHaveBeenCalledTimes(2);
    expect((await store.find(item))?.version).toBe('v2');
  });
  it('rejects invalid defaults and foreign sources without saving anything', async () => {
    const store = new FakeElementStore();
    const item = elementFixture({ siteId: 'other' });
    const useCase = new UpdateRenderingElementUseCase({ execute: async () => siteFixture() },
      { find: async () => item, list: vi.fn() }, store,
      new CompleteElementSaveService(store, { write: vi.fn() }, fakeHookChanges),
      { nextId: () => 'id', nextVersion: () => 'v2', now: () => new Date() });

    await expect(useCase.execute({ ...elementFixture(), expectedVersion: 'v1' }))
      .rejects.toMatchObject({ code: 'NotFound' });
    expect(store.records.size).toBe(0);
  });
});
