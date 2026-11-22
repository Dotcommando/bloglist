import {
  ListAddonInstallationsUseCase,
} from '../../../src/app/use-cases/addons/list-addon-installations.use-case.js';

it('authorizes the initiating site before listing global installation metadata', async () => {
  const access = { requireAdministrator: vi.fn(async () => {}) };
  const store = {
    list: vi.fn(async () => []), findByRepository: vi.fn(), reserve: vi.fn(), complete: vi.fn(),
  };
  const operation = new ListAddonInstallationsUseCase(store, access);

  expect(await operation.execute({ siteId: 'site', actorId: 'admin' })).toEqual([]);
  expect(access.requireAdministrator).toHaveBeenCalledWith('site', 'admin');
  expect(store.list).toHaveBeenCalledOnce();
  store.list.mockClear();
  access.requireAdministrator.mockRejectedValueOnce(new Error('Forbidden'));
  await expect(operation.execute({ siteId: 'other', actorId: 'admin' })).rejects.toThrow('Forbidden');
  expect(store.list).not.toHaveBeenCalled();
});
