import type {
  IPageResolutionObservation, IRenderStageObservation, StageOutcome,
} from '../../../domain/diagnostics/page-resolution.js';
import type { IRenderObservationPort } from './render-observation.port.js';

export interface IRenderTrace {
  readonly start: number;
  readonly stages: IRenderStageObservation[];
  droppedStages: number;
}

export interface IRenderObservationSessions extends IRenderObservationPort {
  create(start?: number): IRenderTrace;
  waitForCompletion(trace: IRenderTrace, outcome?: StageOutcome): Promise<void>;
  run<T>(trace: IRenderTrace, operation: () => Promise<T>): Promise<T>;
}

export interface IResolutionSinkStatus {
  readonly dropped: number;
  readonly failed: number;
  readonly pending: number;
}

export interface IPageResolutionSink {
  submit(observation: IPageResolutionObservation): void;
  status(siteId: string): IResolutionSinkStatus;
}
