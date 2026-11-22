import { type Model, Schema } from 'mongoose';

import { type IJsonLdCatalog, validateJsonLdCatalog } from '../../../../../domain/json-ld/json-ld-catalog.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IJsonLdCatalogStore } from '../../../../../ports/outbound/json-ld/json-ld-catalog.port.js';

export interface IJsonLdCatalogRecord extends IJsonLdCatalog {
  readonly _id: string;
}

export const jsonLdCatalogSchema = new Schema<IJsonLdCatalogRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  version: { type: String, required: true },
  profiles: { type: [Schema.Types.Mixed], required: true },
  objects: { type: [Schema.Types.Mixed], required: true },
}, {
  collection: 'json_ld_catalogs',
  strict: 'throw',
  versionKey: false,
  minimize: false,
  autoIndex: false,
  autoCreate: false,
});

export class MongooseJsonLdCatalog implements IJsonLdCatalogStore {
  constructor(private readonly model: Model<IJsonLdCatalogRecord>) {}

  async read(siteId: string): Promise<IJsonLdCatalog> {
    const record = await this.model.findOne({ _id: siteId, siteId }).lean().exec();

    if (!record) {
      return { siteId, version: '0', profiles: [], objects: [] };
    }

    const catalog = { siteId, version: record.version, profiles: record.profiles, objects: record.objects };

    validateJsonLdCatalog(catalog);

    return catalog;
  }

  async save(catalog: IJsonLdCatalog, expectedVersion: string): Promise<void> {
    validateJsonLdCatalog(catalog);

    try {
      const result = await this.model.updateOne(
        { _id: catalog.siteId, siteId: catalog.siteId, version: expectedVersion },
        { $set: catalog },
        { upsert: expectedVersion === '0', runValidators: true },
      ).exec();

      if (!result.matchedCount && !result.upsertedCount) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'JSON-LD definitions changed');
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'JSON-LD definitions changed');
      }
      throw error;
    }
  }
}
