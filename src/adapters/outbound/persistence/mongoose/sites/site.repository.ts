import type { Model } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import { Site } from '../../../../../domain/sites/site.js';
import { servingSiteAuthority } from '../../../../../domain/sites/site-addresses.js';
import type { ISiteRepository } from '../../../../../ports/outbound/sites/site.repository.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { persistHookChange } from '../hooks/hook-mutation.js';
import type { ISiteRecord } from './site.schema.js';

export function toSite(record: ISiteRecord): Site {
  return new Site({
    ...(record.setupState ? { setupState: record.setupState } : {}),
    ...(record.setupVersion ? { setupVersion: record.setupVersion } : {}),
    ...(record.setupCompletedAt ? { setupCompletedAt: record.setupCompletedAt } : {}),
    ...(record.setupCompletedBy ? { setupCompletedBy: record.setupCompletedBy } : {}),
    ...(record.addresses === undefined ? {} : { addresses: record.addresses }),
    ...(record.transliteration === undefined ? {} : { transliteration: record.transliteration }),
    ...(record.collapseTransliterationHyphens === undefined ? {} : {
      collapseTransliterationHyphens: record.collapseTransliterationHyphens,
    }),
    ...(record.timeZone === undefined ? {} : { timeZone: record.timeZone }),
    siteId: record._id,
    mark: record.mark,
    name: record.name,
    primaryDomain: record.primaryDomain,
    languages: record.languages,
    defaultLanguage: record.defaultLanguage,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export class MongooseSiteRepository implements ISiteRepository {
  constructor(private readonly model: Model<ISiteRecord>, private readonly now: () => Date,
    private readonly hookEvents?: MongooseHookEvents) {}

  async findById(siteId: string): Promise<Site | null> {
    const record = await this.model.findOne({ _id: siteId }).lean().exec();

    return record ? toSite(record) : null;
  }

  async findByMark(mark: string): Promise<Site | null> {
    const record = await this.model.findOne({ markKey: mark.toLowerCase() }).lean().exec();

    return record ? toSite(record) : null;
  }

  async findByPrimaryDomain(primaryDomain: string): Promise<Site | null> {
    const record = await this.model.findOne({ primaryDomain }).lean().exec();

    return record ? toSite(record) : null;
  }

  async findByServingAuthority(authority: string): Promise<Site | null> {
    const record = await this.model.findOne({ servingAuthority: authority }).lean().exec();

    return record ? toSite(record) : null;
  }

  async findAll(): Promise<Site[]> {
    const records = await this.model.find({}).sort({ _id: 1 }).lean().exec();

    return records.map(toSite);
  }

  async save(site: Site, hookChange?: IHookCommitIntent): Promise<Site> {
    return persistHookChange(this.hookEvents, hookChange, async (session) => {

      const state = site.toState();
      const { siteId, ...fields } = state;
      const authority = servingSiteAuthority(state.addresses);
      const record: ISiteRecord = {
        ...fields,
        _id: siteId,
        markKey: state.mark.toLowerCase(),
        ...(authority ? { servingAuthority: authority } : {}),
      };

      try {
        const existing = await this.findById(siteId);

        if (!existing) {
          return toSite((await this.model.insertOne(record, { ...(session ? { session } : {}) })).toObject());
        }
        if (existing.mark !== state.mark || existing.createdAt.getTime() !== state.createdAt.getTime()) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Immutable site fields differ');
        }

        const saved = await this.model.findOneAndUpdate(
          { _id: siteId, mark: state.mark, createdAt: state.createdAt },
          {
            $set: {
              ...(state.addresses === undefined ? {} : { addresses: state.addresses }),
              ...(state.timeZone === undefined ? {} : { timeZone: state.timeZone }),
              ...(authority ? { servingAuthority: authority } : {}),
              name: state.name,
              primaryDomain: state.primaryDomain,
              languages: [...state.languages],
              defaultLanguage: state.defaultLanguage,
              status: state.status,
              updatedAt: this.now(),
            },
          },
          { returnDocument: 'after', runValidators: true, upsert: false, ...(session ? { session } : {}) },
        ).lean().exec();

        if (!saved) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Site changed during persistence');
        }

        return toSite(saved);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 11000) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Site identity, mark or domain already exists');
        }
        throw error;
      }

    });
  }
}
