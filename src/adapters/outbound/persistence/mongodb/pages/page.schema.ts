import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { PageStatus } from '../../../../../domain/pages/page-status.enum.js';
import { PageType } from '../../../../../domain/pages/page-type.enum.js';

@Schema({
  collection: 'pages',
  timestamps: true,
  versionKey: false,
  autoIndex: false,
  autoCreate: false,
})
export class Page {
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
    ref: 'Cluster',
    default: null,
    index: true,
  })
  declare clusterId: Types.ObjectId | null;

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: /^[a-z]{2}$/,
  })
  declare language: string;

  @Prop({
    type: String,
    required: true,
    enum: PageType,
    default: PageType.STATIC,
  })
  declare type: PageType;

  @Prop({
    type: String,
    required: true,
    enum: PageStatus,
    default: PageStatus.DRAFT,
  })
  declare status: PageStatus;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  declare title: string;

  @Prop({
    type: String,
    default: null,
  })
  declare h1: string | null;

  @Prop({
    type: String,
    default: null,
  })
  declare metaTitle: string | null;

  @Prop({
    type: String,
    default: null,
  })
  declare metaDescription: string | null;

  @Prop({
    type: String,
    default: '',
    validate: (value: string | null): boolean => typeof value === 'string',
  })
  declare contentMd: string;

  @Prop({
    type: Boolean,
    required: true,
    default: true,
  })
  declare robotsIndex: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  declare publishedAt: Date | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const PageSchema = SchemaFactory.createForClass(Page);

PageSchema.index(
  { mark: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);

PageSchema.index({
  siteId: 1,
  clusterId: 1,
});
