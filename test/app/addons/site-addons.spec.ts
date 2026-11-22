import { AddonOperationAccess } from '@zarya/addon-contracts/addons';

import { AddonOperationService } from '../../../src/app/services/addons/addon-operation.service.js';
import { AddonRuntimeService } from '../../../src/app/services/addons/addon-runtime.service.js';
import { ConfigureSiteAddonUseCase } from '../../../src/app/use-cases/addons/configure-site-addon.use-case.js';
import { DisableSiteAddonUseCase } from '../../../src/app/use-cases/addons/disable-site-addon.use-case.js';
import { EnableSiteAddonUseCase } from '../../../src/app/use-cases/addons/enable-site-addon.use-case.js';
import { GetSiteAddonUseCase } from '../../../src/app/use-cases/addons/get-site-addon.use-case.js';
import { ListSiteAddonsUseCase } from '../../../src/app/use-cases/addons/list-site-addons.use-case.js';
import { type ISiteAddonState, SiteAddonStatus } from '../../../src/domain/addons/site-addon.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import type { IAddonCatalogPort } from '../../../src/ports/outbound/addons/addon-catalog.port.js';
import type { ISiteAddonStorePort } from '../../../src/ports/outbound/addons/site-addon-store.port.js';
import { fakeHookChanges } from '../../support/hooks.js';

export function addonsFixture(): {
  store: ISiteAddonStorePort;
  catalog: IAddonCatalogPort;
  availability: { requireAvailable(addonKey: string): Promise<void> };
  rows: Map<string, ISiteAddonState>;
  access: { requireAdministrator(siteId: string, actorId: string): Promise<void> };
  values: { now(): Date; nextId(): string; nextVersion(): string };
} {
  const rows = new Map<string, ISiteAddonState>();
  let sequence = 0;
  const definitions = [{
    addonKey: 'example-addon',
    name: { en: 'Example', ru: 'Записи' },
    description: { en: 'Example', ru: 'События' },
    contractVersion: 1,
    implementationVersion: '0.1.0',
    configurationSchemaVersion: 1,
    adminComponentId: 'example-addon',
    snippetIds: ['ExampleData'],
  }];

  return {
    availability: { requireAvailable: async () => {} },
    rows,
    store: {
      listEnabled: async () => [...rows.values()].filter((row) => row.status === SiteAddonStatus.Enabled),
      find: async (siteId, key) => structuredClone(rows.get(siteId + '/' + key) ?? null),
      list: async (siteId) => [...rows.values()].filter((row) => row.siteId === siteId)
        .map((row) => structuredClone(row)),
      commit: async (next, expectedVersion) => {
        const key = next.siteId + '/' + next.addonKey;

        if ((rows.get(key)?.version ?? null) !== expectedVersion) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Connection changed');
        }
        rows.set(key, structuredClone(next));

        return structuredClone(next);
      },
    },
    catalog: {
      list: () => definitions,
      find: (key) => definitions.find((item) => item.addonKey === key) ?? null,
      validate: (key, config) => {
        if (key !== 'example-addon' || config.schemaVersion !== 1 || Object.keys(config.values).length) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Invalid configuration');
        }
      },
    },
    access: {
      requireAdministrator: async (siteId, actorId) => {
        if (siteId !== 'site-1' || actorId !== 'operator') {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Denied');
        }
      },
    },
    values: {
      now: () => new Date('2026-10-28T10:00:00Z'),
      nextId: () => 'id-' + ++sequence,
      nextVersion: () => 'v-' + ++sequence,
    },
  };
}

export const addonInput = { siteId: 'site-1', actorId: 'operator', addonKey: 'example-addon' };

export const configuration = { schemaVersion: 1, values: {} };

describe('site add-ons', () => {
  it('rejects an unavailable enabled registration before serving requests', async () => {
    const f = addonsFixture();
    const enable = new EnableSiteAddonUseCase(f.store, f.catalog, f.access, f.values, f.availability, fakeHookChanges);

    await enable.execute({ ...addonInput, expectedVersion: null, configuration });
    await new AddonRuntimeService(f.store, f.catalog, f.availability).validate();
    const missing: IAddonCatalogPort = { ...f.catalog, find: () => null };

    await expect(new AddonRuntimeService(f.store, missing, f.availability).validate())
      .rejects.toMatchObject({ code: 'AddonUnavailable' });
  });
  it('enables once, rejects stale commands, retains identity and gates each site', async () => {
    const f = addonsFixture();
    const enable = new EnableSiteAddonUseCase(f.store, f.catalog, f.access, f.values, f.availability, fakeHookChanges);
    const saved = await enable.execute({ ...addonInput, expectedVersion: null, configuration });

    expect(saved.status).toBe(SiteAddonStatus.Enabled);
    await expect(enable.execute({ ...addonInput, expectedVersion: null, configuration }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    const same = await enable.execute({ ...addonInput, expectedVersion: saved.version, configuration });

    expect(same.version).toBe(saved.version);
    const policy = new AddonOperationService(f.store, 'example-addon');

    await expect(policy.authorize('other', AddonOperationAccess.PublicEnabled))
      .rejects.toMatchObject({ code: 'AddonDisabled' });
    const disable = new DisableSiteAddonUseCase(f.store, f.access, f.values, fakeHookChanges);
    const disabled = await disable.execute({ ...addonInput, expectedVersion: saved.version });

    await expect(policy.authorize('site-1', AddonOperationAccess.PublicEnabled))
      .rejects.toMatchObject({ code: 'AddonDisabled' });
    await expect(policy.authorize('site-1', AddonOperationAccess.AdministrationRetained))
      .resolves.toHaveProperty('version', disabled.version);
    const configure = new ConfigureSiteAddonUseCase(f.store, f.catalog, f.access, f.values, f.availability,
      fakeHookChanges);
    const configured = await configure.execute({ ...addonInput, expectedVersion: disabled.version, configuration });

    expect(configured.status).toBe(SiteAddonStatus.Disabled);
    const restored = await enable.execute({ ...addonInput, expectedVersion: configured.version, configuration });

    expect(restored.siteAddonId).toBe(saved.siteAddonId);
    expect(restored.createdAt).toEqual(saved.createdAt);
    const get = new GetSiteAddonUseCase(f.store, f.catalog, f.access);

    expect((await get.execute(addonInput)).connection).toEqual(restored);
  });
  it('rejects unauthorized access, unknown configuration and missing connections without writes', async () => {
    const f = addonsFixture();
    const enable = new EnableSiteAddonUseCase(f.store, f.catalog, f.access, f.values, f.availability, fakeHookChanges);

    await expect(enable.execute({ ...addonInput, actorId: 'intruder', expectedVersion: null, configuration }))
      .rejects.toMatchObject({ code: 'Forbidden' });
    await expect(enable.execute({
      ...addonInput,
      expectedVersion: null,
      configuration: { schemaVersion: 2, values: {} },
    })).rejects.toMatchObject({ code: 'Validation' });
    const disable = new DisableSiteAddonUseCase(f.store, f.access, f.values, fakeHookChanges);

    await expect(disable.execute({ ...addonInput, expectedVersion: 'missing' }))
      .rejects.toMatchObject({ code: 'NotFound' });
    expect(f.rows.size).toBe(0);
  });
  it('lists registered definitions without granting a connection', async () => {
    const f = addonsFixture();
    const result = await new ListSiteAddonsUseCase(f.store, f.catalog, f.access).execute(addonInput);

    expect(result).toEqual([{
      addonKey: 'example-addon',
      definition: f.catalog.find('example-addon'),
      connection: null,
    }]);
    expect(f.rows.size).toBe(0);
  });
});
