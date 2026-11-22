import { type ClientSession, type Model, Schema } from 'mongoose';

import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import {
  type ITemplateVariableCatalog,
  validateTemplateVariables,
} from '../../../../../domain/template-variables/template-variable.js';
import type {
  ITemplateVariableStore,
} from '../../../../../ports/outbound/template-variables/template-variables.port.js';

export interface ITemplateVariableRecord extends ITemplateVariableCatalog {
  readonly _id: string;
  readonly editFence?: number;
}

export const templateVariableSchema = new Schema<ITemplateVariableRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  version: { type: String, required: true },
  fields: { type: [Schema.Types.Mixed], required: true },
  editFence: { type: Number, default: 0 },
}, {
  collection: 'template_variables',
  strict: 'throw',
  versionKey: false,
  minimize: false,
  autoIndex: false,
  autoCreate: false,
});

export class MongooseTemplateVariables implements ITemplateVariableStore {
  constructor(private readonly model: Model<ITemplateVariableRecord>) {}

  async read(siteId: string): Promise<ITemplateVariableCatalog> {
    const record = await this.model.findOne({ _id: siteId, siteId }).lean().exec();

    if (!record) {
      return { siteId, version: '0', fields: [] };
    }
    validateTemplateVariables(record.fields);

    return { siteId, version: record.version, fields: record.fields };
  }

  async save(catalog: ITemplateVariableCatalog, expectedVersion: string): Promise<void> {
    validateTemplateVariables(catalog.fields);

    try {
      const result = await this.model.updateOne({
        _id: catalog.siteId,
        siteId: catalog.siteId,
        version: expectedVersion,
      },
      { $set: { siteId: catalog.siteId, version: catalog.version, fields: catalog.fields } },
      { upsert: expectedVersion === '0', runValidators: true }).exec();

      if (!result.matchedCount && !result.upsertedCount) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'TV definitions changed');
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'TV definitions changed');
      }
      throw error;
    }
  }

  async guard(siteId: string, version: string, session: ClientSession): Promise<void> {
    const result = await this.model.updateOne({ _id: siteId, siteId, version }, {
      $inc: { editFence: 1 }, ...(version === '0' ? { $setOnInsert: { siteId, version: '0', fields: [] } } : {}),
    }, { session, upsert: version === '0' }).exec();

    if (!result.matchedCount && !result.upsertedCount) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'TV definitions changed');
    }
  }

}

