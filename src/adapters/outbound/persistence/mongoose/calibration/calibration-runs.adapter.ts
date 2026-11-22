import { type Connection, type Model, Schema } from 'mongoose';

import { CalibrationRunStatus, type ICalibrationMeasurement, type ICalibrationRun } from
  '../../../../../domain/calibration/calibration-run.js';
import type { ICalibrationRunsPort } from '../../../../../ports/outbound/calibration/calibration-runs.port.js';

interface IRunRecord {
  readonly _id: string;
  readonly siteIds: readonly string[];
  readonly startedAt: Date;
  readonly status: CalibrationRunStatus;
  readonly snapshot: ICalibrationRun;
}

interface IMeasurementRecord {
  readonly _id: string;
  readonly runId: string;
  readonly startedAt: Date;
  readonly snapshot: ICalibrationMeasurement;
}

const runSchema = new Schema<IRunRecord>({
  _id: { type: String, required: true },
  siteIds: { type: [String], required: true },
  startedAt: { type: Date, required: true },
  status: { type: String, enum: Object.values(CalibrationRunStatus), required: true },
  snapshot: { type: Schema.Types.Mixed, required: true },
}, { collection: 'calibration_runs', strict: 'throw', autoCreate: false, autoIndex: false, versionKey: false });

const measurementSchema = new Schema<IMeasurementRecord>({
  _id: { type: String, required: true },
  runId: { type: String, required: true },
  startedAt: { type: Date, required: true },
  snapshot: { type: Schema.Types.Mixed, required: true },
}, { collection: 'calibration_measurements', strict: 'throw', autoCreate: false, autoIndex: false, versionKey: false });

export class MongooseCalibrationRuns implements ICalibrationRunsPort {
  private readonly runs: Model<IRunRecord>;
  private readonly samples: Model<IMeasurementRecord>;

  constructor(connection: Connection) {
    this.runs = connection.model<IRunRecord>('CalibrationRun', runSchema);
    this.samples = connection.model<IMeasurementRecord>('CalibrationMeasurement', measurementSchema);
  }

  async create(run: ICalibrationRun): Promise<void> {
    await this.runs.insertOne({
      _id: run.runId,
      siteIds: [...run.siteIds],
      startedAt: run.startedAt,
      status: run.status,
      snapshot: run,
    });
  }

  async save(run: ICalibrationRun): Promise<void> {
    const result = await this.runs.updateOne({ _id: run.runId }, {
      $set: { status: run.status, snapshot: run },
    }).exec();

    if (result.matchedCount !== 1) {
      throw new Error('Calibration run no longer exists');
    }
  }

  async get(runId: string): Promise<ICalibrationRun | null> {
    const row = await this.runs.findById(runId).lean().exec();

    return row?.snapshot ?? null;
  }

  async latest(siteId: string | null, limit: number): Promise<readonly ICalibrationRun[]> {
    const rows = await this.runs.find(siteId ? { siteIds: siteId } : {})
      .sort({ startedAt: -1, _id: -1 }).limit(limit).lean().exec();

    return rows.map(row => row.snapshot);
  }

  async append(measurement: ICalibrationMeasurement): Promise<void> {
    await this.samples.insertOne({
      _id: measurement.measurementId,
      runId: measurement.runId,
      startedAt: measurement.startedAt,
      snapshot: measurement,
    });
  }

  async measurements(runId: string): Promise<readonly ICalibrationMeasurement[]> {
    const rows = await this.samples.find({ runId }).sort({ startedAt: 1, _id: 1 }).lean().exec();

    return rows.map(row => row.snapshot);
  }

  async interruptRunning(at: Date): Promise<void> {
    await this.runs.updateMany({ status: CalibrationRunStatus.Running }, {
      $set: {
        status: CalibrationRunStatus.Interrupted,
        'snapshot.status': CalibrationRunStatus.Interrupted,
        'snapshot.finishedAt': at,
        'snapshot.error': 'Coordinator restarted; original resources recovered from its journal',
        'snapshot.phase': 'Interrupted',
        'snapshot.winnerId': null,
        'snapshot.restored': true,
      },
    }).exec();
  }
}
