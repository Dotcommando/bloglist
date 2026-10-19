import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export enum ClusterStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

@Schema({
  collection: 'clusters',
  timestamps: true,
  versionKey: false,
  autoIndex: false,
  autoCreate: false,
})
export class Cluster {
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
  declare parentClusterId: Types.ObjectId | null;

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  })
  declare language: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  declare name: string;

  @Prop({
    type: String,
    default: null,
  })
  declare descriptionMd: string | null;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  declare industry: string | null;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  declare geography: string | null;

  @Prop({
    type: String,
    default: null,
    trim: true,
  })
  declare primaryQuery: string | null;

  @Prop({
    type: String,
    required: true,
    enum: ClusterStatus,
    default: ClusterStatus.ACTIVE,
  })
  declare status: ClusterStatus;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const ClusterSchema = SchemaFactory.createForClass(Cluster);

ClusterSchema.index(
  { mark: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
  },
);

ClusterSchema.index({
  siteId: 1,
  language: 1,
});
