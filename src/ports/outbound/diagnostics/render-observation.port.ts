import type { RenderStage, StageOutcome } from '../../../domain/diagnostics/page-resolution.js';

export interface IObservationInterval { finish(outcome?: StageOutcome): void; }

export interface IRenderObservationPort {
  start?(stage: RenderStage): IObservationInterval;
  measure<T>(stage: RenderStage, operation: () => Promise<T>): Promise<T>;
  sync<T>(stage: RenderStage, operation: () => T): T;
  outcome(outcome: StageOutcome): void;
}
