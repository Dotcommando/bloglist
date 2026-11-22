import type {
  IPageResolutionRecord, IResolutionStatistics, IResolutionStatisticsFilter,
} from '../../../domain/diagnostics/page-resolution.js';

export interface IPageResolutionWriter { append(record: IPageResolutionRecord): Promise<void>; }

export interface IPageResolutionReader { statistics(filter:
IResolutionStatisticsFilter):
Promise<IResolutionStatistics>; }
