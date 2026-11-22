export enum ResolutionPeriod { Today = 'today', Week = 'week', Month = 'month', Custom = 'custom' }

export enum DeliveryFilter { All = 'all',
  Static = 'Static',
  Dynamic = 'Dynamic',
  Redirect = 'Redirect',
  Unresolved = 'Unresolved' }

export enum RepresentationFilter { All = 'all', Html = 'Html', Markdown = 'Markdown' }

export enum MethodFilter { All = 'all', Get = 'GET', Head = 'HEAD' }

export enum OutcomeFilter {
  All = 'all', Success = 'Success', Redirect = 'Redirect', NotFound = 'NotFound',
  Invalid = 'Invalid', Unavailable = 'Unavailable', Failure = 'Failure', Aborted = 'Aborted',
}

export interface IResolutionFilters {
  from?: string;
  to?: string;
  cmsVersion?: string;
  delivery: DeliveryFilter;
  representation: RepresentationFilter;
  method: MethodFilter;
  outcome: OutcomeFilter;
}

export interface IResolutionRow {
  path: string;
  calls: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
}

export interface IResolutionStatistics {
  from: string;
  to: string;
  today: string;
  timeZone: string;
  retainedSince: string;
  versions: string[];
  rows: IResolutionRow[];
  diagnostics: { dropped: number; failed: number; pending: number };
}
