import type { ICalibrationRun } from '../../../domain/calibration/calibration-run.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { ICalibrationRunsPort } from '../../../ports/outbound/calibration/calibration-runs.port.js';
import type { ICalibrationResourceLease } from '../../../ports/outbound/calibration/calibration-runtime.port.js';
import type { CalibrationSearchService } from './calibration-search.service.js';

/** Owns background promises, cancellation and shutdown; the search owns all restoration paths. */
export class CalibrationJobsService {
  private active: { runId: string; controller: AbortController; task: Promise<void> } | null = null;
  private failure: unknown;
  private readonly pending = new Map<string, ICalibrationRun>();
  private closing = false;

  constructor(private readonly search: CalibrationSearchService, private readonly runs: ICalibrationRunsPort) {}

  async recover(): Promise<void> {
    await this.runs.interruptRunning(new Date());
  }

  start(run: ICalibrationRun, lease: ICalibrationResourceLease): void {
    if (this.active || this.closing) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Calibration is already active or stopping');
    }
    this.failure = undefined;
    const controller = new AbortController();
    const task = this.search.execute(run, lease, controller.signal, result => {
      this.pending.set(run.runId, result);
    });

    this.active = { runId: run.runId, controller, task };
    void task.then(() => {
      this.pending.delete(run.runId);
      this.active = null;
    }, error => {
      this.failure = error;
      this.active = null;
    });
  }

  async flush(): Promise<void> {
    for (const [runId, result] of this.pending) {
      await this.runs.save(result);
      this.pending.delete(runId);
    }
    this.failure = undefined;
  }

  async cancel(runId: string): Promise<void> {
    if (this.active?.runId === runId) {
      this.active.controller.abort(new Error('Calibration cancelled'));
      await this.active.task;
    }
    if (this.failure) {
      throw this.failure;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;

    if (this.active) {
      this.active.controller.abort(new Error('Coordinator stopping'));
      await this.active.task;
    }
  }
}
