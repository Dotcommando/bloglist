import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export enum UrlKind {
  PAGE = 'PAGE',
  REDIRECT = 'REDIRECT',
}

export enum UrlRedirectStatus {
  HTTP_301 = 301,
  HTTP_308 = 308,
}

@Schema({
  collection: 'urls',
  timestamps: true,
  versionKey: false,
  autoIndex: false,
  autoCreate: false,
})
export class Url {
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
    ref: 'Site',
    required: true,
    index: true,
  })
  declare siteId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Url',
    default: null,
    index: true,
    immutable: true,
  })
  declare parentUrlId: Types.ObjectId | null;

  @Prop({
    type: String,
    required: true,
    trim: true,
    immutable: true,
  })
  declare segment: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    immutable: true,
  })
  declare path: string;

  @Prop({
    type: String,
    required: true,
    enum: UrlKind,
  })
  declare kind: UrlKind;

  @Prop({
    type: Types.ObjectId,
    ref: 'Page',
    default: null,
    index: true,
  })
  declare pageId: Types.ObjectId | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'Url',
    default: null,
  })
  declare redirectTargetUrlId: Types.ObjectId | null;

  @Prop({
    type: Number,
    enum: UrlRedirectStatus,
    default: null,
  })
  declare redirectStatus: UrlRedirectStatus | null;

  @Prop({
    type: Date,
    required: true,
    default: Date.now,
  })
  declare firstPublishedAt: Date;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const UrlSchema = SchemaFactory.createForClass(Url);

UrlSchema.index(
  { mark: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);

UrlSchema.index(
  {
    siteId: 1,
    path: 1,
  },
  {
    unique: true,
  },
);

UrlSchema.index(
  { pageId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: 'PAGE',
      pageId: { $type: 'objectId' },
    },
  },
);
