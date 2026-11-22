import type {
  IGetPageResolutionStatistics,
} from '../../../../ports/inbound/diagnostics/get-page-resolution-statistics.port.js';

export interface IPageResolutionOperationsFactory { forSession(token:
string | null):
Promise<IGetPageResolutionStatistics>; }
