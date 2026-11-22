import { type Connection, type Model, Schema, type SchemaOptions } from 'mongoose';

import {
  type IActivePublication,
  type IPublicationReleaseState,
  ReleaseState,
} from '../../../../../domain/publication/publication-release.js';

export interface IReleaseRecord extends Omit<IPublicationReleaseState, 'releaseId'> { readonly _id: string; }

export interface IActiveRecord extends IActivePublication { readonly _id: string; }

export interface IActivationRecord { readonly _id: string; readonly siteId: string; readonly activatedAt: Date; }

export interface IPublicationModels {
  readonly connection: Connection;
  readonly releases: Model<IReleaseRecord>;
  readonly active: Model<IActiveRecord>;
  readonly activations: Model<IActivationRecord>;
}

const options = { strict: 'throw', versionKey: false, autoIndex: false, autoCreate: false } satisfies SchemaOptions;

const releaseSchema = new Schema<IReleaseRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  siteKey: { type: String },
  state: { type: String, enum: Object.values(ReleaseState), required: true },
  manifest: { type: Schema.Types.Mixed, default: null },
  failure: { type: String, default: null },
  createdAt: { type: Date, required: true },
  completedAt: { type: Date, default: null },
}, { ...options, collection: 'publication_releases', minimize: false });

const activeSchema = new Schema<IActiveRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  releaseId: { type: String, required: true },
  activatedAt: { type: Date, required: true },
}, { ...options, collection: 'active_publications' });

const activationSchema = new Schema<IActivationRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  activatedAt:
{ type: Date, required: true },
}, { ...options, collection: 'publication_activations' });

export function publicationModels(connection: Connection): IPublicationModels {
  return {
    connection,
    releases: connection.model<IReleaseRecord>('PublicationRelease', releaseSchema),
    active: connection.model<IActiveRecord>('ActivePublication', activeSchema),
    activations: connection.model<IActivationRecord>('PublicationActivation', activationSchema),
  };
}
