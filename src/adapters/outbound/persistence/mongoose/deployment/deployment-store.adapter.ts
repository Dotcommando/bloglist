import { type Connection, type Model, Schema } from 'mongoose';

import {
  DeploymentIssue, DeploymentReason, DeploymentRecovery, DeploymentStage, DeploymentState, type IDeploymentRecord,
} from '../../../../../domain/deployment/deployment.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import { requireCondition } from '../../../../../domain/shared/validation.js';
import type { IDeploymentStorePort } from '../../../../../ports/outbound/deployment/deployment-store.port.js';

interface IDeploymentDocument extends IDeploymentRecord {
  readonly _id: string;
}

const options = { _id: false, strict: 'throw' as const };

const publication = new Schema({
  releaseId: { type: String, required: true },
  generation: { type: String, required: true },
}, options);

const diagnostic = new Schema({
  issue: { type: String, enum: Object.values(DeploymentIssue), required: true },
  retryable: { type: Boolean, required: true },
  stage: { type: String, enum: Object.values(DeploymentStage) },
  reason: { type: String, enum: Object.values(DeploymentReason) },
  httpStatus: { type: Number, min: 100, max: 599, validate: Number.isInteger },
  recovery: { type: String, enum: Object.values(DeploymentRecovery) },
}, options);

const target = new Schema({
  targetId: { type: String, required: true },
  siteId: { type: String, required: true },
  version: { type: String, required: true },
  providerKey: { type: String, required: true },
  destinationName: { type: String, required: true },
  publicOrigin: { type: String, required: true },
  backendOrigin: { type: String, required: true },
  enabled: { type: Boolean, required: true },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
}, options);

const attempt = new Schema({
  attemptId: { type: String, required: true },
  target: { type: target, required: true },
  publication: { type: publication, required: true },
  startedAt: { type: Date, required: true },
  ownershipUntil: { type: Date, required: true },
}, options);

const delivered = new Schema({
  releaseId: { type: String, required: true },
  generation: { type: String, required: true },
  targetVersion: { type: String, required: true },
  providerVersion: { type: String, required: true },
  completedAt: { type: Date, required: true },
}, options);

export const deploymentSchema = new Schema<IDeploymentDocument>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  version: { type: String, required: true },
  target: { type: target, required: true },
  state: { type: String, enum: Object.values(DeploymentState), required: true },
  attempt: { type: attempt, default: null },
  requested: { type: publication, default: null },
  attempts: { type: Number, required: true },
  retryAt: { type: Date, default: null },
  diagnostic: { type: diagnostic, default: null },
  delivered: { type: delivered, default: null },
}, { collection: 'deployment_targets', versionKey: false, strict: 'throw', autoCreate: false, autoIndex: false });

function fromRecord(row: IDeploymentDocument, siteId: string): IDeploymentRecord {
  const { _id, ...record } = row;

  requireCondition(record.siteId === siteId && record.target.siteId === siteId
    && record.target.targetId === _id, 'Invalid deployment ownership');

  return record;
}

export class MongooseDeploymentStore implements IDeploymentStorePort {
  private readonly model: Model<IDeploymentDocument>;

  constructor(connection: Connection) {
    this.model = connection.model<IDeploymentDocument>('DeploymentTarget', deploymentSchema);
  }

  async get(siteId: string): Promise<IDeploymentRecord | null> {
    const row = await this.model.findOne({ siteId }).lean().exec();

    return row ? fromRecord(row, siteId) : null;
  }

  async list(): Promise<readonly IDeploymentRecord[]> {
    const rows = await this.model.find({}).lean().exec();

    return rows.map((row) => fromRecord(row, row.siteId));
  }

  async save(record: IDeploymentRecord, expectedVersion: string | null): Promise<void> {
    requireCondition(record.target.siteId === record.siteId
      && (!record.attempt || record.attempt.target.siteId === record.siteId), 'Foreign deployment target');
    const document: IDeploymentDocument = { _id: record.target.targetId, ...record };

    try {
      if (expectedVersion === null) {
        await this.model.create(document);
      } else {
        const result = await this.model.replaceOne({
          _id: record.target.targetId,
          siteId: record.siteId,
          version: expectedVersion,
        }, document).exec();

        if (result.matchedCount !== 1) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Deployment state changed');
        }
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Concurrent deployment configuration');
      }
      throw error;
    }
  }
}
