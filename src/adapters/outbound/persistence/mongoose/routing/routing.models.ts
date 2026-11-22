import { type ClientSession, type Connection, type Model, Schema } from 'mongoose';

import type { IUrlState } from '../../../../../domain/routing/url.js';
import type { IUrlHistoryEntry } from '../../../../../domain/routing/url-history-entry.js';
import { UrlKind } from '../../../../../domain/routing/url-kind.enum.js';

export interface IUrlRecord extends Omit<IUrlState, 'urlId'> {
  readonly version?: string;
  readonly _id: string;
  readonly markKey: string;
}

export interface IUrlHistoryRecord extends Omit<IUrlHistoryEntry, 'urlHistoryEntryId'> {
  readonly _id: string;
  readonly siteId: string;
}

interface IRoutingVersionRecord {
  readonly _id: string;
  readonly siteId: string;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IRoutingModels {
  readonly connection: Connection;
  readonly urls: Model<IUrlRecord>;
  readonly history: Model<IUrlHistoryRecord>;
  readonly versions: Model<IRoutingVersionRecord>;
}

const urlSchema = new Schema<IUrlRecord>({
  version: { type: String },
  _id: { type: String, required: true },
  siteId: { type: String, required: true, immutable: true },
  mark: { type: String, required: true, immutable: true },
  markKey: { type: String, required: true, immutable: true },
  parentUrlId: { type: String, default: null, immutable: true },
  segment: { type: String, required: true, immutable: true },
  path: { type: String, required: true, immutable: true },
  kind: { type: String, enum: Object.values(UrlKind), required: true },
  pageId: { type: String, default: null },
  redirectTargetUrlId: { type: String, default: null },
  redirectStatus: { type: Number, enum: [301, 308, null], default: null },
  firstPublishedAt: { type: Date, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true },
  updatedAt: { type: Date, required: true },
}, { collection: 'urls', strict: 'throw', versionKey: false, autoIndex: false, autoCreate: false });

const historySchema = new Schema<IUrlHistoryRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  urlId: { type: String, required: true },
  kind: { type: String, enum: Object.values(UrlKind), required: true },
  pageId: { type: String, default: null },
  redirectTargetUrlId: { type: String, default: null },
  redirectStatus: { type: Number, enum: [301, 308, null], default: null },
  createdAt: { type: Date, required: true },
}, { collection: 'url_history', strict: 'throw', versionKey: false, autoIndex: false, autoCreate: false });

const versionSchema = new Schema<IRoutingVersionRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  revision: { type: Number, min: 1, max: Number.MAX_SAFE_INTEGER, required: true },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
}, { collection: 'routing_versions', strict: 'throw', versionKey: false, autoIndex: false, autoCreate: false });

export function createRoutingModels(connection: Connection): IRoutingModels {
  return {
    connection,
    urls: connection.model<IUrlRecord>('Url', urlSchema),
    history: connection.model<IUrlHistoryRecord>('UrlHistory', historySchema),
    versions: connection.model<IRoutingVersionRecord>('RoutingVersion', versionSchema),
  };
}

export async function advanceRoutingVersion(models: IRoutingModels, siteId: string, at: Date,
  session: ClientSession): Promise<void> {
  await models.versions.updateOne({ _id: siteId }, {
    $inc: { revision: 1 },
    $set: { updatedAt: at },
    $setOnInsert: { siteId, createdAt: at },
  }, { upsert: true, session, runValidators: true, setDefaultsOnInsert: false }).exec();
}
