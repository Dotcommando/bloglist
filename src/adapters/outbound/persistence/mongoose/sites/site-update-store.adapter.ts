import { isDeepStrictEqual } from 'node:util';

import type { ClientSession, Connection } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import { type ISiteState, Site } from '../../../../../domain/sites/site.js';
import { servingSiteAuthority } from '../../../../../domain/sites/site-addresses.js';
import { SiteStatus } from '../../../../../domain/sites/site-status.enum.js';
import type {
  ISitePageLanguageUsagePort, ISiteUpdateStorePort,
} from '../../../../../ports/outbound/sites/site-update-store.port.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { recordHookChange } from '../hooks/hook-mutation.js';
import { toSite } from './site.repository.js';
import { type ISiteRecord, siteSchema } from './site.schema.js';
import { lockSiteContent } from './site-content-guard.js';

export class MongooseSiteUpdateStore implements ISiteUpdateStorePort {
  constructor(private readonly connection: Connection, private readonly pageUsage: (session: ClientSession) =>
  ISitePageLanguageUsagePort, private readonly now: () => Date, private readonly hookEvents?: MongooseHookEvents) {}

  async saveUpdate(previous: ISiteState, next: Site, hookChange?: IHookCommitIntent): Promise<Site> {
    const state = next.toState();

    if (
      state.siteId !== previous.siteId
      || state.mark !== previous.mark
      || state.status !== previous.status
      && state.status !== SiteStatus.ARCHIVED
      || state.createdAt.getTime() !== previous.createdAt.getTime()
    ) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Site update changed immutable identity or lifecycle');
    }

    const session = await this.connection.startSession();
    let committing = false;

    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      await lockSiteContent(this.connection, session, state.siteId);
      const model = this.connection.model<ISiteRecord>('Site', siteSchema);
      const record = await model.findOne({ _id: state.siteId }).session(session).lean().exec();

      if (!record) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Site disappeared');
      }
      if (!isDeepStrictEqual(toSite(record).toState(), previous)) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Site changed');
      }

      const removed = previous.languages.filter((language) => !state.languages.includes(language));

      if (removed.length && await this.pageUsage(session).hasPages(state.siteId, removed)) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Cannot remove a language with pages');
      }

      const updatedAt = this.now();
      const updated = await model.findOneAndUpdate({ _id: state.siteId }, {
        $set: {
          ...(state.addresses === undefined ? {} : { addresses: state.addresses }),
          ...(state.timeZone === undefined ? {} : { timeZone: state.timeZone }),
          ...(state.transliteration === undefined ? {} : { transliteration: state.transliteration }),
          ...(state.collapseTransliterationHyphens === undefined ? {} : {
            collapseTransliterationHyphens: state.collapseTransliterationHyphens,
          }),
          ...(servingSiteAuthority(state.addresses) ? { servingAuthority: servingSiteAuthority(state.addresses) } : {}),
          name: state.name,
          primaryDomain: state.primaryDomain,
          languages: [...state.languages],
          defaultLanguage: state.defaultLanguage,
          status: state.status,
          updatedAt,
        },
      }, { session, returnDocument: 'after', runValidators: true }).lean().exec();

      if (!updated) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Site disappeared');
      }
      await recordHookChange(this.hookEvents, hookChange, session);
      committing = true;
      await session.commitTransaction();

      return new Site({ ...state, updatedAt });
    } catch (error) {
      if (!committing) {
        await session.abortTransaction().catch(() => undefined);

        if (error instanceof Error && 'code' in error && [11000, 112, 244].includes(Number(error.code))) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Concurrent site change or duplicate domain');
        }
      }
      throw error;
    } finally {
      await session.endSession().catch(() => undefined);
    }
  }
}
