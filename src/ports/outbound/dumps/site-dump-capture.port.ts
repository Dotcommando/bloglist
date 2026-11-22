import type { ISiteDump, ISiteDumpCreation } from '../../../domain/dumps/site-dump.js';

export interface ISiteDumpCapturePort {
  capture(siteId: string, options?: ISiteDumpCreation, signal?: AbortSignal): Promise<ISiteDump>;
}
