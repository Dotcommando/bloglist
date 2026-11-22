import { Schema } from 'mongoose';

import { OpenGraphType } from '../../../../../domain/pages/open-graph-type.enum.js';
import type { IPageState } from '../../../../../domain/pages/page.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../../../../domain/pages/page-rendering.js';
import { PageStatus } from '../../../../../domain/pages/page-status.enum.js';
import { PageType } from '../../../../../domain/pages/page-type.enum.js';

interface IStoredLoader {
  readonly loaderId: string;
  readonly alias: string;
  readonly phase: LoaderPhase;
  readonly parameters: Record<string, unknown>;
  readonly dependsOn: readonly string[];
  readonly required: boolean;
}

import type { IRequestCachePolicy } from '../../../../../domain/publication/request-cache.policy.js';

export interface IStoredRendering {
  readonly requestCache?: IRequestCachePolicy;
  readonly templateId: string;
  readonly delivery: HtmlDelivery;
  readonly interaction: BrowserInteraction;
  readonly parameters: Record<string, unknown>;
  readonly loaders: readonly IStoredLoader[];
}

export interface IPageRecord extends Omit<IPageState, 'pageId' | 'rendering' | 'tvValues'> {
  readonly createdBy?: string | null;
  readonly accessGroupId?: string | null;
  readonly tvValues?: Record<string, unknown>;
  readonly _id: string;
  readonly markKey: string;
  readonly rendering?: IStoredRendering;
}

const loaderSchema = new Schema<IStoredLoader>({
  loaderId: { type: String, required: true },
  alias: { type: String, required: true },
  phase: { type: String, enum: Object.values(LoaderPhase), required: true },
  parameters: { type: Schema.Types.Mixed, required: true },
  dependsOn: { type: [String], required: true },
  required: { type: Boolean, required: true },
}, { _id: false, id: false, strict: 'throw', minimize: false });

const renderingSchema = new Schema<IStoredRendering>({
  requestCache: { type: Schema.Types.Mixed, required: false, default: undefined },
  templateId: { type: String, required: true },
  delivery: { type: String, enum: Object.values(HtmlDelivery), required: true },
  interaction: { type: String, enum: Object.values(BrowserInteraction), required: true },
  parameters: { type: Schema.Types.Mixed, required: true },
  loaders: { type: [loaderSchema], required: true },
}, { _id: false, id: false, strict: 'throw', minimize: false });

export const pageSchema = new Schema<IPageRecord>({
  mimeType: { type: String, default: 'text/html' },
  excludeFromSitemap: { type: Boolean, default: false },
  systemDocument: { type: String, default: null, immutable: true },
  tvValues: { type: Schema.Types.Mixed, required: false, default: undefined },
  _id: { type: String, required: true },
  pageNumber: { type: String, default: null, immutable: true },
  parentPageId: { type: String, default: null },
  sortOrder: { type: Number, default: 100 },
  siteId: { type: String, required: true, immutable: true },
  createdBy: { type: String, immutable: true },
  accessGroupId: { type: String },
  mark: { type: String, required: true, immutable: true },
  markKey: { type: String, required: true, immutable: true },
  language: { type: String, required: true, immutable: true },
  clusterId: { type: String, default: null },
  type: { type: String, enum: Object.values(PageType), required: true },
  status: { type: String, enum: Object.values(PageStatus), required: true },
  title: { type: String, required: true },
  h1: { type: String, default: null },
  metaTitle: { type: String, default: null },
  metaDescription: { type: String, default: null },
  ogTitle: { type: String, default: null },
  ogDescription: { type: String, default: null },
  ogImage: { type: String, default: null },
  ogType: { type: String, enum: [...Object.values(OpenGraphType), null], default: null },
  contentMd: { type: String, required: false, default: '' },
  robotsIndex: { type: Boolean, required: true },
  publishedAt: { type: Date, default: null },
  createdAt: { type: Date, required: true, immutable: true },
  updatedAt: { type: Date, required: true },
  rendering: { type: renderingSchema, required: false, default: undefined },
}, { collection: 'pages', minimize: false, strict: 'throw', versionKey: false, autoIndex: false, autoCreate: false });
