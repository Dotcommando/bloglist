import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { SiteStatus } from '../../../../../domain/sites/site-status.enum.js';

@Schema({
  collection: 'sites',
  timestamps: true,
  versionKey: false,
  autoIndex: false,
  autoCreate: false,
})
export class Site {
  declare _id: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    trim: true,
    immutable: true,
    match: /^[A-Za-z][A-Za-z0-9]*$/,
  })
  declare mark: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  declare name: string;

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  })
  declare primaryDomain: string;

  @Prop({
    type: [String],
    required: true,
    default: ['en'],
    set: (values: string[]) =>
      values.map((value) => value.trim().toLowerCase()),
    validate: {
      validator: (values: string[]): boolean =>
        values.every((value) => /^[a-z]{2}$/.test(value))
            && new Set(values).size === values.length,
      message: 'languages must contain unique two-letter language codes',
    },
  })
  declare languages: string[];

  @Prop({
    type: String,
    required: true,
    default: 'en',
  })
  declare defaultLanguage: string;

  @Prop({
    type: String,
    required: true,
    enum: SiteStatus,
    default: SiteStatus.ACTIVE,
  })
  declare status: SiteStatus;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const SiteSchema = SchemaFactory.createForClass(Site);

SiteSchema.index(
  { mark: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);

SiteSchema.index(
  { primaryDomain: 1 },
  { unique: true },
);
