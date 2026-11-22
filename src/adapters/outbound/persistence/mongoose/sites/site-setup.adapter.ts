import type { Model } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import { SetupState } from '../../../../../domain/installation/setup-state.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { Site } from '../../../../../domain/sites/site.js';
import type { ISiteSetupPort } from '../../../../../ports/outbound/sites/site-setup.port.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { persistHookChange } from '../hooks/hook-mutation.js';
import { toSite } from './site.repository.js';
import type { ISiteRecord } from './site.schema.js';

export class MongooseSiteSetup implements ISiteSetupPort {
  constructor(private readonly model: Model<ISiteRecord>, private readonly events: MongooseHookEvents) {}

  async complete(previous: Site, next: Site, hookChange: IHookCommitIntent): Promise<Site> {
    return persistHookChange(this.events, hookChange, async (session) => {
      const state = next.toState();
      const row = await this.model.findOneAndUpdate({
        _id: previous.siteId,
        mark: previous.mark,
        setupState: SetupState.Pending,
      }, {
        $set: {
          setupState: state.setupState,
          setupVersion: state.setupVersion,
          setupCompletedAt: state.setupCompletedAt,
          setupCompletedBy: state.setupCompletedBy,
        },
      },
      { returnDocument: 'after', ...(session ? { session } : {}) }).lean().exec();

      if (!row) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Site setup changed');
      }

      return toSite(row);
    });
  }
}
