import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

// Site ownership is inherited from the referenced cluster.
@Schema({
  collection: 'cluster_blogs',
  timestamps: true,
  versionKey: false,
  autoIndex: false,
  autoCreate: false,
})
export class ClusterBlog {
  declare _id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Cluster',
    required: true,
    index: true,
  })
  declare clusterId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Blog',
    required: true,
    index: true,
  })
  declare blogId: Types.ObjectId;

  @Prop({
    type: Number,
    required: true,
  })
  declare position: number;

  @Prop({
    type: String,
    default: null,
  })
  declare notesMd: string | null;

  @Prop({ type: Boolean, required: true, default: true })
  declare visible: boolean;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const ClusterBlogSchema =
  SchemaFactory.createForClass(ClusterBlog);

ClusterBlogSchema.index(
  {
    clusterId: 1,
    blogId: 1,
  },
  {
    unique: true,
  },
);

ClusterBlogSchema.index({
  clusterId: 1,
  position: 1,
});
