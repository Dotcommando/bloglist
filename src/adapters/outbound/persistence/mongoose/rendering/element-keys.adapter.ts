import { type Model, mongo, Schema } from 'mongoose';

import { TemplateSourceKind } from '../../../../../domain/publication/render-plan.js';
import { maximumElementOrdinal } from '../../../../../domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IElementKeys } from '../../../../../ports/outbound/rendering/element-keys.port.js';

export interface IElementKeyRecord {
  readonly _id: string;
  readonly siteId: string;
  readonly kind: TemplateSourceKind;
  readonly lastOrdinal: bigint;
}

export const elementKeySchema = new Schema<IElementKeyRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true, immutable: true },
  kind: { type: String, required: true, immutable: true, enum: Object.values(TemplateSourceKind) },
  lastOrdinal: { type: Schema.Types.BigInt, required: true },
}, {
  collection: 'rendering_element_sequences', strict: 'throw', autoIndex: false, autoCreate: false, versionKey: false,
});

export class MongooseElementKeys implements IElementKeys {
  constructor(private readonly model: Model<IElementKeyRecord>) {}

  async reserve(input: Parameters<IElementKeys['reserve']>[0]): Promise<string> {
    if (input.after < 0n || input.after >= maximumElementOrdinal) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Element key sequence exhausted');
    }

    try {
      const result = await this.model.findOneAndUpdate({ _id: JSON.stringify([input.siteId, input.kind]) }, [
        {
          $set: {
            siteId: { $literal: input.siteId },
            kind: { $literal: input.kind },
            lastOrdinal: {
              $add: [
                {
                  $max: [
                    { $ifNull: ['$lastOrdinal', mongo.Long.ZERO] }, mongo.Long.fromString(input.after.toString()),
                  ],
                },
                mongo.Long.ONE,
              ],
            },
          },
        },
      ], { upsert: true, returnDocument: 'after', useBigInt64: true, updatePipeline: true }).lean().exec();
      const ordinal: unknown = result?.lastOrdinal;

      if (typeof ordinal !== 'bigint' || ordinal <= input.after || ordinal > maximumElementOrdinal) {
        throw new Error('Invalid reserved element ordinal');
      }

      return ordinal.toString();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 121) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Element key sequence exhausted');
      }
      throw error;
    }
  }
}
