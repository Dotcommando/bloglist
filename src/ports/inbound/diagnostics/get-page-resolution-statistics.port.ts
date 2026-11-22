import type {
  IResolutionStatistics, PageDelivery, ResolutionMethod, ResolutionOutcome, ResolutionRepresentation,
} from '../../../domain/diagnostics/page-resolution.js';

export interface IGetPageResolutionStatisticsInput {
  readonly siteId: string;
  readonly from?: string;
  readonly to?: string;
  readonly cmsVersion?: string;
  readonly delivery?: PageDelivery | null;
  readonly representation?: ResolutionRepresentation | null;
  readonly method?: ResolutionMethod | null;
  readonly outcome?: ResolutionOutcome | null;
}

export interface IPageResolutionStatistics extends IResolutionStatistics {
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly today: string;
  readonly retainedSince: string;
}

export interface IGetPageResolutionStatistics { execute(input:
IGetPageResolutionStatisticsInput):
Promise<IPageResolutionStatistics>; }
