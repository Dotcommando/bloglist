import type { IMediaUsageTarget } from '../../../../domain/media/file-library.js';
import type { IFileLibraryOperations } from '../../../../ports/inbound/media/file-library.port.js';

export interface IAdminFileOperations extends IFileLibraryOperations {
  readonly readableUsageTargets: (siteId: string, targets: readonly IMediaUsageTarget[]) =>
  Promise<ReadonlySet<string>>;
}

export interface IAdminFileOperationFactory {
  forSession(token: string | null): IAdminFileOperations;
}
