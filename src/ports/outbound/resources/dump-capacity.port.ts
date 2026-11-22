import type { DumpExecutionMode } from '../../../domain/resources/site-process-allocation.js';

export interface IDumpCapacityLease {
  readonly mode: DumpExecutionMode;
  release(): Promise<void>;
}

export interface IDumpCapacityPort {
  reserve(siteId: string): Promise<IDumpCapacityLease>;
}
