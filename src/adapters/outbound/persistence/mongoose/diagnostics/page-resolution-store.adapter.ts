import { randomUUID } from 'node:crypto';

import {
  type AccumulatorOperator, type Connection, type Expression, type Model, type PipelineStage, Schema,
} from 'mongoose';

import type {
  IPageResolutionRecord, IResolutionStatistics, IResolutionStatisticsFilter, IResolutionStatisticsRow,
} from '../../../../../domain/diagnostics/page-resolution.js';
import {
  PageDelivery, RenderStage, ResolutionMethod, ResolutionOutcome, ResolutionRepresentation, StageOutcome,
} from '../../../../../domain/diagnostics/page-resolution.js';
import type {
  IPageResolutionReader, IPageResolutionWriter,
} from '../../../../../ports/outbound/diagnostics/page-resolution-store.port.js';

interface IResolutionDocument extends IPageResolutionRecord { _id: string; expiresAt: Date; }

const stageSchema = new Schema({
  id: { type: Number, required: true },
  parentId: { type: Number, default: null },
  stage: { type: String, enum: Object.values(RenderStage), required: true },
  offsetMs: { type: Number, required: true, min: 0 },
  durationMs: { type: Number, required: true, min: 0 },
  outcome: { type: String, enum: Object.values(StageOutcome), required: true },
}, { _id: false });

const resolutionSchema = new Schema<IResolutionDocument>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  path: { type: String, required: true },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  cmsVersion: { type: String, required: true },
  durationMs: { type: Number, required: true, min: 0 },
  completionMs: { type: Number, required: true, min: 0 },
  method: { type: String, enum: Object.values(ResolutionMethod), required: true },
  representation: { type: String, enum: Object.values(ResolutionRepresentation), required: true },
  delivery: { type: String, enum: Object.values(PageDelivery), required: true },
  outcome: { type: String, enum: Object.values(ResolutionOutcome), required: true },
  statusCode: { type: Number, required: true, min: 100, max: 599 },
  stages: { type: [stageSchema], required: true },
  droppedStages: { type: Number, required: true, min: 0 },
}, { collection: 'page_resolutions', versionKey: false, autoCreate: false, autoIndex: false });

export class MongoosePageResolutionStore implements IPageResolutionWriter, IPageResolutionReader {
  private readonly model: Model<IResolutionDocument>;

  constructor(connection: Connection) {
    this.model = connection.model<IResolutionDocument>('PageResolution', resolutionSchema);
  }

  async append(record: IPageResolutionRecord): Promise<void> {
    await this.model.create({
      _id: randomUUID(),
      ...record,
      expiresAt: new Date(record.startedAt.getTime() + 90 * 86400000),
    });
  }

  async statistics(filter: IResolutionStatisticsFilter): Promise<IResolutionStatistics> {
    const range = { siteId: filter.siteId, startedAt: { $gte: filter.from, $lt: filter.until } };
    const match = {
      ...range,
      ...(filter.cmsVersion ? { cmsVersion: filter.cmsVersion } : {}),
      ...(filter.delivery ? { delivery: filter.delivery } : {}),
      ...(filter.representation ? { representation: filter.representation } : {}),
      ...(filter.method ? { method: filter.method } : {}),
      ...(filter.outcome ? { outcome: filter.outcome } : {}),
    };
    const window: { documents: [string, string] } = { documents: ['unbounded', 'unbounded'] };
    const atRank = (rank: Expression): AccumulatorOperator =>
      ({
        $max: {
          $cond: [{
            $eq: ['$rank',
              rank],
          },
          '$durationMs',
          null],
        },
      });
    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $setWindowFields: {
          partitionBy: '$path',
          sortBy: { durationMs: 1 },
          output: {
            rank: { $documentNumber: {} },
            calls: { $count: {}, window },
            averageMs: { $avg: '$durationMs', window },
          },
        },
      },
      {
        $group: {
          _id: '$path',
          calls: { $first: '$calls' },
          averageMs: { $first: '$averageMs' },
          low: atRank({ $floor: { $divide: [{ $add: ['$calls', 1] }, 2] } }),
          high: atRank({ $ceil: { $divide: [{ $add: ['$calls', 1] }, 2] } }),
          p95Ms: atRank({ $ceil: { $multiply: ['$calls', 0.95] } }),
          p99Ms: atRank({ $ceil: { $multiply: ['$calls', 0.99] } }),
        },
      },
      {
        $project: {
          _id: 0,
          path: '$_id',
          calls: 1,
          averageMs: 1,
          p95Ms: 1,
          p99Ms: 1,
          medianMs: { $divide: [{ $add: ['$low', '$high'] }, 2] },
        },
      },
      { $sort: { calls: -1, path: 1 } },
    ];
    const [rows, versions] = await Promise.all([
      this.model.aggregate<IResolutionStatisticsRow>(pipeline).allowDiskUse(true).option({ maxTimeMS: 10000 }).exec(),
      this.model.distinct('cmsVersion', range).maxTimeMS(10000).exec(),
    ]);

    return { rows, versions: versions.sort() };
  }
}
