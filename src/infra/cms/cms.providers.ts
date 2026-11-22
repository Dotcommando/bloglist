import path from 'node:path';

import type { Provider } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import type { DumpMaintenance } from '../../adapters/outbound/backup/files/dump-maintenance.js';
import {
  LocalPreviewDeliveryAdapter,
} from '../../adapters/outbound/publication/local/preview-delivery.adapter.js';
import { AddonOperationService } from '../../app/services/addons/addon-operation.service.js';
import { CmsApiService } from '../../app/services/cms/cms-api.service.js';
import {
  CmsExtensionRegistryService,
} from '../../app/services/cms/cms-extension-registry.service.js';
import { SITE_ADDON_STORE } from '../addons/addons.tokens.js';
import { DUMP_MAINTENANCE } from '../dumps/dumps.tokens.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { CMS_API, CMS_EXTENSIONS, CMS_SNIPPET_API } from './cms.tokens.js';
import { cmsCoreOperations } from './cms-operations.factory.js';

export function cmsApiProviders(settings: ILocalApplicationSettings | IPublicHttpSettings): Provider[] {
  const rendering = 'operator' in settings ? settings.rendering : settings;
  const preview = new LocalPreviewDeliveryAdapter();

  return [{
    provide: CMS_EXTENSIONS,
    inject: [ModuleRef],
    useFactory: (ref: ModuleRef) => new CmsExtensionRegistryService({
      authorize: async (siteId, addonKey, access) => {
        await new AddonOperationService(ref.get(SITE_ADDON_STORE, { strict: false }), addonKey)
          .authorize(siteId, access);
      },
    }),
  }, {
    provide: CMS_API,
    inject: [ModuleRef, CMS_EXTENSIONS],
    useFactory: (ref: ModuleRef, extensions: CmsExtensionRegistryService) => new CmsApiService({
      forContext: (context) => cmsCoreOperations({
        sourcesRoot: rendering?.sourcesRoot ?? path.resolve('sites'),
        ...(rendering?.loaders ? { loaders: rendering.loaders } : {}),
        ...(settings.media ? { media: settings.media } : {}),
      }, ref, context, preview),
    }, extensions),
  }, {
    provide: CMS_SNIPPET_API,
    inject: [CMS_API, { token: DUMP_MAINTENANCE, optional: true }],
    useFactory: (service: CmsApiService, maintenance?: DumpMaintenance) => ({
      forSnippet: (siteId: string, snippetId: string, readOnly = false) => service.forContext({
        siteId, actorId: 'cms-snippet:' + snippetId, readOnly: readOnly || maintenance?.captureActive === true,
      }),
    }),
  }, {
    provide: 'CmsApiPreviewLifecycle',
    useValue: { onApplicationShutdown: () => preview.close() },
  }];
}
