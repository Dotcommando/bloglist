import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export enum SiteStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

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
    match: /^\S+$/,
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
