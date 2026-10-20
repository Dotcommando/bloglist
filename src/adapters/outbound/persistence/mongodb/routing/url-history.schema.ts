import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { UrlKind } from '../../../../../domain/routing/url-kind.enum.js';
import { UrlRedirectStatus } from '../../../../../domain/routing/url-redirect-status.enum.js';

// Site ownership is inherited from the referenced URL.
@Schema({
  collection: 'url_history',
  timestamps: {
    createdAt: true,
    updatedAt: false,
  },
  versionKey: false,
  autoIndex: false,
  autoCreate: false,
})
export class UrlHistory {
  declare _id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Url',
    required: true,
    index: true,
  })
  declare urlId: Types.ObjectId;

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

  declare createdAt: Date;
}

export const UrlHistorySchema = SchemaFactory.createForClass(UrlHistory);

UrlHistorySchema.index({
  urlId: 1,
  createdAt: -1,
});
