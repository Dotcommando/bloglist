import { Schema } from 'mongoose';

import type { ISiteState } from '../../../../../domain/sites/site.js';
import { SiteOriginMode } from '../../../../../domain/sites/site-origin-mode.enum.js';
import { SiteStatus } from '../../../../../domain/sites/site-status.enum.js';

export interface ISiteRecord extends Omit<ISiteState, 'siteId'> {
  readonly _id: string;
  readonly markKey: string;
  readonly servingAuthority?: string;
}

export const siteSchema = new Schema<ISiteRecord>({
  setupState: { type: String, required: false },
  setupVersion: { type: String, required: false },
  setupCompletedAt: { type: Date, required: false },
  setupCompletedBy: { type: String, required: false },
  timeZone: { type: String, required: false },
  collapseTransliterationHyphens: { type: Boolean, required: false },
  transliteration: {
    type: [new Schema({
      language: { type: String, required: true },
      symbol: { type: String, required: true },
      replacement: { type: String, default: '' },
    }, { _id: false, strict: 'throw' })],
    default: undefined,
  },
  addresses: {
    type: new Schema({
      publicOrigin: { type: String, default: null },
      localOrigin: { type: String, default: null },
      originMode: { type: String, enum: Object.values(SiteOriginMode), required: false },
    }, { _id: false, strict: 'throw' }),
    required: false,
    default: undefined,
  },
  _id: { type: String, required: true },
  servingAuthority: { type: String, required: false },
  mark: { type: String, required: true, immutable: true },
  markKey: { type: String, required: true, immutable: true },
  name: { type: String, required: true },
  primaryDomain: { type: String, required: true },
  languages: { type: [String], required: true },
  defaultLanguage: { type: String, required: true },
  status: { type: String, enum: Object.values(SiteStatus), required: true },
  createdAt: { type: Date, required: true, immutable: true },
  updatedAt: { type: Date, required: true },
}, { collection: 'sites', strict: 'throw', versionKey: false, autoCreate: false, autoIndex: false });
