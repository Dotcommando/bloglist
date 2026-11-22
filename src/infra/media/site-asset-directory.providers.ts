import path from 'node:path';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { type ISiteRecord, siteSchema } from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../../adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import {
  PublicationDirectoryAdapter,
} from '../../adapters/outbound/publication/files/publication-directory.adapter.js';
import { SiteAssetDirectoryAdapter } from '../../adapters/outbound/storage/files/media/site-asset-directory.adapter.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { SITE_ASSET_DIRECTORY } from './media.tokens.js';

export function siteAssetDirectoryProviders(media: { readonly root: string } | undefined,
  artifactsRoot?: string): Provider[] {
  if (!media && !artifactsRoot) {
    return [{ provide: SITE_ASSET_DIRECTORY, useValue: null }];
  }

  return [{
    provide: SITE_ASSET_DIRECTORY,
    inject: [MONGO_CONNECTION],
    useFactory: (connection: Connection) => {
      const scope = new MongooseSiteStorageScope(connection.model<ISiteRecord>('Site', siteSchema));
      const directories = [
        ...(media ? [new SiteAssetDirectoryAdapter(media.root, scope)] : []),
        ...(artifactsRoot ? [new PublicationDirectoryAdapter(path.resolve(artifactsRoot), scope)] : []),
      ];

      return {
        synchronize: async (siteId: string): Promise<void> => {
          for (const directory of directories) {
            await directory.synchronize(siteId);
          }
        },
      };
    },
  }];
}
