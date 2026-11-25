import type { ClientSession, Connection } from 'mongoose';

import { type IMediaUsage, MediaUsageGroup, MediaUsageTargetKind } from '../../../../../domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IRuntimeAddonRegistration } from '../../../runtime/addons/addon-package.types.js';

/** Uses the same owned collection declarations as portable add-on dumps. */
export class MongooseAddonFileReferences {
  constructor(private readonly connection: Connection,
    private readonly registrations: () => readonly IRuntimeAddonRegistration[]) {}

  async find(siteId: string, fileId: string, session?: ClientSession): Promise<readonly IMediaUsage[]> {
    const result: IMediaUsage[] = [];

    for (const { definition, transfer } of this.registrations()) {
      for (const owner of transfer?.collections ?? []) {
        for (const field of owner.references.filter((reference) => reference.collection === 'media_files')) {
          const dotPath = field.path.split('.').filter((segment) => segment !== '*').join('.');
          const found = await this.connection.collection(owner.name).findOne({ siteId, [dotPath]: fileId }, {
            projection: { _id: 1 },
            ...(session ? { session } : {}),
          });

          if (found) {
            result.push({
              group: MediaUsageGroup.Content,
              target: { kind: MediaUsageTargetKind.Addon, id: definition.addonKey },
              title: definition.name.en,
              field: owner.name + '.' + field.path,
              state: 'Stored',
            });
          }
        }
      }
    }

    return result;
  }

  async requireUnused(siteId: string, fileId: string, session: ClientSession): Promise<void> {
    if ((await this.find(siteId, fileId, session)).length) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Image is in use by an add-on');
    }
  }
}
