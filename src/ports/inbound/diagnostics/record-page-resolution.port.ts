import type { IPageResolutionObservation } from '../../../domain/diagnostics/page-resolution.js';

// Private trusted delivery entry point. No public administrative mutation route.
export interface IRecordPageResolution { execute(input: IPageResolutionObservation): Promise<void>; }
