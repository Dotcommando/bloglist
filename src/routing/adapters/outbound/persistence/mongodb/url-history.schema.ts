import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export enum UrlHistoryKind {
  PAGE = 'PAGE',
  REDIRECT = 'REDIRECT',
}

export enum UrlHistoryRedirectStatus {
  HTTP_301 = 301,
  HTTP_308 = 308,
}

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
    enum: UrlHistoryKind,
  })
  declare kind: UrlHistoryKind;

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
    enum: UrlHistoryRedirectStatus,
    default: null,
  })
  declare redirectStatus: UrlHistoryRedirectStatus | null;

  declare createdAt: Date;
}

export const UrlHistorySchema =
  SchemaFactory.createForClass(UrlHistory);

UrlHistorySchema.index({
  urlId: 1,
  createdAt: -1,
});
