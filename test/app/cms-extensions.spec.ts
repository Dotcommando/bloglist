import { AddonOperationAccess } from '@zarya/addon-contracts/addons';
import type { ICmsApi } from '@zarya/addon-contracts/cms';
import { describe, expect, it, vi } from 'vitest';

import { CmsExtensionRegistryService } from '../../src/app/services/cms/cms-extension-registry.service.js';
import type { CmsApi } from '../../src/ports/inbound/cms/cms-api.port.js';
import { CmsExtensionOperationKind } from '../../src/ports/outbound/cms/cms-extension.port.js';

describe('add-on object API registry', () => {
  it('binds context and checks live add-on availability on every call', async () => {
    const authorize = vi.fn(async () => {});
    const registry = new CmsExtensionRegistryService({ authorize });
    const execute = vi.fn(async (_input, context) => ({ siteId: context.siteId }));

    registry.register('synthetic', {
      version: 1,
      objects: {
        records: {
          get: { kind: CmsExtensionOperationKind.Query, access: AddonOperationAccess.PublicEnabled, execute },
        },
      },
    });
    const cms: CmsApi & ICmsApi = Object.create(null);
    const client = registry.forContext({ siteId: 'a', actorId: 'trusted' }, cms);

    expect(await client.synthetic!.records!.get!({ id: 'r' })).toEqual({ siteId: 'a' });
    expect(authorize).toHaveBeenCalledWith('a', 'synthetic', AddonOperationAccess.PublicEnabled);
    authorize.mockRejectedValueOnce(new Error('Disabled'));
    await expect(client.synthetic!.records!.get!({})).rejects.toThrow('Disabled');
    expect(execute).toHaveBeenCalledOnce();
    registry.unregister('synthetic');
    await expect(client.synthetic!.records!.get!({})).rejects.toThrow();
  });
  it('rejects duplicate namespaces and invalid registrations', () => {
    const registry = new CmsExtensionRegistryService({ authorize: async () => {} });
    const extension = { version: 1 as const, objects: {} };

    registry.register('synthetic', extension);
    expect(() => registry.register('synthetic', extension)).toThrow();
    expect(() => registry.register('__proto__', extension)).toThrow();
  });
});
