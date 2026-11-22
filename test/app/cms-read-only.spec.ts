import { AddonOperationAccess } from '@zarya/addon-contracts/addons';

import { CmsApiService } from '../../src/app/services/cms/cms-api.service.js';
import { CmsExtensionRegistryService } from '../../src/app/services/cms/cms-extension-registry.service.js';
import type { CmsApi, ICmsCoreOperations } from '../../src/ports/inbound/cms/cms-api.port.js';
import { CmsExtensionOperationKind } from '../../src/ports/outbound/cms/cms-extension.port.js';

it('rejects core and nested add-on commands before dispatch for parallel reads', async () => {
  const get = vi.fn(async () => ({ title: 'read' }));
  const write = vi.fn(async () => ({}));
  const operations: ICmsCoreOperations = Object.assign(Object.create(null), {
    pages: { get: { execute: get }, update: { execute: write }, preview: { execute: write } },
  });
  const registry = new CmsExtensionRegistryService({ authorize: async () => {} });

  registry.register('synthetic', {
    version: 1,
    objects: {
      records: {
        change: { kind: CmsExtensionOperationKind.Command, access: AddonOperationAccess.PublicEnabled, execute: write },
        nested: {
          kind: CmsExtensionOperationKind.Query,
          access: AddonOperationAccess.PublicEnabled,
          execute: async (_input, context) => {
            await context.cms.pages!.update!({ pageId: 'p' });

            return null;
          },
        },
      },
    },
  });
  const service = new CmsApiService({ forContext: () => operations }, registry);
  const context = { siteId: 'site', actorId: 'snippet', readOnly: true };
  const cms: CmsApi = service.forContext(context);

  expect(await cms.pages.get({ pageId: 'p' })).toMatchObject({ title: 'read' });
  await expect(service.invoke(context, 'pages', 'update', {})).rejects.toThrow();
  await expect(service.invoke(context, 'pages', 'preview', {})).rejects.toThrow();
  await expect(cms.extensions.synthetic!.records!.change!({})).rejects.toThrow();
  await expect(cms.extensions.synthetic!.records!.nested!({})).rejects.toThrow();
  expect(write).not.toHaveBeenCalled();
});
