import { Schema } from 'mongoose';

import { TemplateSourceKind } from '../../../../../domain/publication/render-plan.js';
import { ElementBackupState, type IRenderingElementState } from '../../../../../domain/rendering/rendering-element.js';

export interface IElementRecord extends Omit<IRenderingElementState, 'elementId'> {
  readonly _id: string;
  readonly backupGuard?: string;
  readonly createdBy?: string | null;
  readonly accessGroupId?: string | null;
}

export const elementSchema = new Schema<IElementRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true, immutable: true },
  createdBy: { type: String, immutable: true },
  accessGroupId: { type: String },
  key: { type: String, required: true, immutable: true },
  name: { type: String, required: true },
  kind: { type: String, required: true, enum: Object.values(TemplateSourceKind), immutable: true },
  version: { type: String, required: true },
  html: { type: String, default: '' },
  css: { type: String, default: '' },
  browserTypeScript: { type: String, default: null },
  parameters: { type: [Schema.Types.Mixed], required: true },
  snippet: { type: Schema.Types.Mixed, required: false },
  createdAt: { type: Date, required: true, immutable: true },
  updatedAt: { type: Date, required: true },
  backupState: { type: String, required: true, enum: Object.values(ElementBackupState) },
  backupGuard: { type: String, required: false },
}, {
  collection: 'rendering_elements',
  strict: 'throw',
  minimize: false,
  autoIndex: false,
  autoCreate: false,
  versionKey: false,
});
