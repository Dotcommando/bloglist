import type { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import { RegisteredAddonCatalogAdapter } from
  '../../src/adapters/outbound/runtime/addons/registered-addon-catalog.adapter.js';
import type { IAddonConfiguration } from '../../src/domain/addons/site-addon.js';

it('reads the current registry and validates only the selected add-on configuration', () => {
  const validate = vi.fn<(configuration: IAddonConfiguration) => void>();
  const registration: ReturnType<AddonPackageRegistry['registrations']>[number] = {
    definition: {
      addonKey: 'synthetic',
      implementationVersion: '1.0.0',
      contractVersion: 1,
      configurationSchemaVersion: 1,
      adminComponentId: null,
      snippetIds: [],
      name: { en: 'Synthetic', ru: 'Synthetic' },
      description: { en: 'Test', ru: 'Test' },
    },
    validate,
    migrationsDirectory: '/synthetic/migrations',
    defaultConfiguration: () => ({ schemaVersion: 1, values: {} }),
  };
  let registrations: ReturnType<AddonPackageRegistry['registrations']> = [];
  const catalog = new RegisteredAddonCatalogAdapter({ registrations: () => registrations });

  expect(catalog.list()).toEqual([]);
  expect(catalog.find('synthetic')).toBeNull();
  expect(() => catalog.validate('missing', { schemaVersion: 1, values: {} }))
    .toThrow(expect.objectContaining({ code: 'NotFound' }));
  expect(validate).not.toHaveBeenCalled();
  registrations = [registration];
  expect(catalog.list()).toEqual([registration.definition]);
  expect(catalog.find('synthetic')).toEqual(registration.definition);
  const configuration = { schemaVersion: 1, values: { title: 'Private title' } };

  catalog.validate('synthetic', configuration);
  expect(validate).toHaveBeenCalledExactlyOnceWith(configuration);
  const invalid = new Error('Synthetic invalid configuration');

  validate.mockImplementationOnce(() => {
    throw invalid;
  });
  expect(() => catalog.validate('synthetic', configuration)).toThrow(invalid);
});
