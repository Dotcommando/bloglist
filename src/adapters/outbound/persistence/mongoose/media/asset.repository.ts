import { type Connection, type Model, Schema } from 'mongoose';

import { Asset, AssetProcessingState, type IAssetState } from '../../../../../domain/media/asset.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IAssetRepository } from '../../../../../ports/outbound/media/asset.repository.js';

export interface IAssetRecord extends Omit<IAssetState, 'assetVersion'> { readonly _id: string; }

const dimensions = new Schema({ width: Number, height: Number, aspectRatio: Number }, { _id: false });

const content = new Schema({ contentId: { type: String, required: true } }, { _id: false });

const variant = new Schema({
  variantId: String,
  content,
  mimeType: String,
  byteSize: Number,
  checksum: String,
  dimensions,
}, { _id: false });

const mapping = new Schema({ profileId: String, variantIds: [String] }, { _id: false });

const schema = new Schema<IAssetRecord>({
  _id: { type: String, required: true },
  assetId: { type: String, required: true },
  siteId: { type: String, required: true },
  filename: String,
  mode: { type: String, default: undefined },
  mimeType: String,
  byteSize: Number,
  checksum: String,
  original: content,
  file: { type: content, default: undefined },
  visibility: String,
  state: String,
  failure: { type: String, default: null },
  version: String,
  originalDimensions: { type: dimensions, default: null },
  profileVersion: { type: String, default: null },
  variants: [variant],
  profileMappings: [mapping],
  createdAt: Date,
  updatedAt: Date,
}, { collection: 'assets', versionKey: false, autoIndex: false, autoCreate: false, strict: 'throw' });

export function assetModel(connection: Connection): Model<IAssetRecord> {
  return connection.model<IAssetRecord>('Asset', schema);
}

export class MongooseAssetRepository implements IAssetRepository {
  constructor(private readonly model: Model<IAssetRecord>) {}

  async findVersion(siteId: string, assetId: string, assetVersion: string): Promise<Asset | null> {
    const record = await this.model.findOne({ _id: assetVersion, assetId, siteId }).lean().exec();

    if (!record) {
      return null;
    }

    const { _id, ...state } = record;

    return new Asset({ ...state, assetVersion: _id });
  }

  async create(asset: Asset): Promise<void> {
    const { assetVersion, ...state } = asset.toState();

    await this.model.create({ ...state, _id: assetVersion });
  }

  async commitProcessing(asset: Asset, expectedVersion: string): Promise<void> {
    const { assetVersion, ...state } = asset.toState();
    const result = await this.model.updateOne({
      _id: assetVersion,
      assetId: state.assetId,
      siteId: state.siteId,
      state: AssetProcessingState.Processing,
      version: expectedVersion,
    }, { $set: state }).exec();

    if (result.matchedCount !== 1) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Asset processing changed');
    }
  }
}
