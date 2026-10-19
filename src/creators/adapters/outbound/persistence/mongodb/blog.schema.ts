import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export enum BlogPlatform {
  YOUTUBE = 'YOUTUBE',
  INSTAGRAM = 'INSTAGRAM',
  TIKTOK = 'TIKTOK',
  X = 'X',
  FACEBOOK = 'FACEBOOK',
  LINKEDIN = 'LINKEDIN',
  DISCORD = 'DISCORD',
  WEBSITE = 'WEBSITE',
  OTHER = 'OTHER',
}

export enum BlogStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

// Global creator catalog shared across sites.
@Schema({
  collection: 'blogs',
  timestamps: true,
  versionKey: false,
  autoIndex: false,
  autoCreate: false,
})
export class Blog {
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
    type: Types.ObjectId,
    ref: 'Blogger',
    required: true,
    index: true,
  })
  declare bloggerId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: BlogPlatform,
    index: true,
  })
  declare platform: BlogPlatform;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  declare name: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  declare url: string;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  declare externalId: string | null;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  declare handle: string | null;

  @Prop({
    type: Number,
    default: null,
    min: 0,
  })
  declare followers: number | null;

  @Prop({
    type: String,
    default: null,
  })
  declare description: string | null;

  @Prop({
    type: Date,
    default: null,
  })
  declare lastCheckedAt: Date | null;

  @Prop({
    type: String,
    required: true,
    enum: BlogStatus,
    default: BlogStatus.ACTIVE,
  })
  declare status: BlogStatus;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const BlogSchema =
  SchemaFactory.createForClass(Blog);

BlogSchema.index(
  { mark: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);

BlogSchema.index(
  { url: 1 },
  { unique: true },
);

BlogSchema.index(
  {
    platform: 1,
    externalId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      externalId: { $type: 'string' },
    },
  },
);
