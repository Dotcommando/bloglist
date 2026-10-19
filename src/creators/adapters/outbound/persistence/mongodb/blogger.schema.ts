import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export enum BloggerType {
  PERSON = 'PERSON',
  TEAM = 'TEAM',
  BRAND = 'BRAND',
}

export enum BloggerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

// Global creator catalog shared across sites.
@Schema({
  collection: 'bloggers',
  timestamps: true,
  versionKey: false,
  autoIndex: false,
  autoCreate: false,
})
export class Blogger {
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
    enum: BloggerType,
    default: BloggerType.PERSON,
  })
  declare type: BloggerType;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  declare country: string | null;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  declare website: string | null;

  @Prop({
    type: String,
    default: null,
    trim: true,
    lowercase: true,
  })
  declare contactEmail: string | null;

  @Prop({
    type: String,
    default: null,
  })
  declare notesMd: string | null;

  @Prop({
    type: String,
    required: true,
    enum: BloggerStatus,
    default: BloggerStatus.ACTIVE,
  })
  declare status: BloggerStatus;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const BloggerSchema =
  SchemaFactory.createForClass(Blogger);

BloggerSchema.index(
  { mark: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);
