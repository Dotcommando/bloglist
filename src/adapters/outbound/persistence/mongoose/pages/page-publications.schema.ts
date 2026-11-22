import { Schema } from 'mongoose';

import type { IPageState } from '../../../../../domain/pages/page.js';

export interface IPublishedPageVersion {
  readonly publishedAt: Date;
  readonly page: IPageState;
}

export interface IPagePublicationsRecord {
  readonly _id: string;
  readonly siteId: string;
  readonly versions: readonly IPublishedPageVersion[];
}

export const pagePublicationsSchema = new Schema<IPagePublicationsRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true, immutable: true },
  versions: { type: [Schema.Types.Mixed], required: true },
}, { collection: 'page_publications', strict: 'throw', versionKey: false, autoIndex: false, autoCreate: false });
