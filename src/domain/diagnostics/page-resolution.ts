export enum PageDelivery {
  Static = 'Static',
  Dynamic = 'Dynamic',
  Redirect = 'Redirect',
  Unresolved = 'Unresolved',
}

export enum ResolutionOutcome {
  Success = 'Success',
  Redirect = 'Redirect',
  NotFound = 'NotFound',
  Invalid = 'Invalid',
  Unavailable = 'Unavailable',
  Failure = 'Failure',
  Aborted = 'Aborted',
}

export enum ResolutionMethod { Get = 'GET', Head = 'HEAD' }

export enum ResolutionRepresentation { Html = 'Html', Markdown = 'Markdown' }

export enum StageOutcome { Success = 'Success',
  Failure = 'Failure',
  Aborted = 'Aborted',
  Timeout = 'Timeout',
  Fallback = 'Fallback' }

export enum RenderStage {
  Site = 'site', Route = 'route', Activation = 'activation', Plan = 'plan', Request = 'request',
  Cache = 'request-cache',
  Scheduling = 'snippet-scheduling', Runtime = 'runtime', Tokenization = 'tokenization',
  Parameters = 'parameters', Preparation = 'preparation',
  Snippet = 'snippet', Deduplication = 'deduplication', Input = 'input', Output = 'output',
  WorkerQueue = 'worker-queue', WorkerStartup = 'worker-startup', Script = 'script', Bridge = 'bridge',
  Transfer = 'transfer', Cleanup = 'cleanup',
  Composition = 'composition', Validation = 'validation', Assets = 'assets', JsonLd = 'json-ld',
  StyleHashes = 'style-hashes', Markdown = 'markdown', Artifact = 'artifact',
}

export interface IRenderStageObservation {
  readonly id: number;
  readonly parentId: number | null;
  readonly stage: RenderStage;
  readonly offsetMs: number;
  readonly durationMs: number;
  readonly outcome: StageOutcome;
}

export interface IPageResolutionObservation {
  readonly siteId: string;
  readonly path: string;
  readonly startedAt: Date;
  readonly durationMs: number;
  readonly completionMs: number;
  readonly method: ResolutionMethod;
  readonly representation: ResolutionRepresentation;
  readonly delivery: PageDelivery;
  readonly statusCode: number;
  readonly outcome: ResolutionOutcome;
  readonly stages: readonly IRenderStageObservation[];
  readonly droppedStages: number;
}

export interface IPageResolutionRecord extends IPageResolutionObservation { readonly cmsVersion: string; }

export interface IResolutionStatisticsFilter {
  readonly siteId: string;
  readonly from: Date;
  readonly until: Date;
  readonly cmsVersion?: string;
  readonly delivery?: PageDelivery;
  readonly representation?: ResolutionRepresentation;
  readonly method?: ResolutionMethod;
  readonly outcome?: ResolutionOutcome;
}

export interface IResolutionStatisticsRow {
  readonly path: string;
  readonly calls: number;
  readonly averageMs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

export interface IResolutionStatistics {
  readonly rows: readonly IResolutionStatisticsRow[];
  readonly versions: readonly string[];
}
