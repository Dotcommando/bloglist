export enum PublishedResolutionKind {
  StoredDocument = 'StoredDocument',
  RequestPlan = 'RequestPlan',
  Redirect = 'Redirect',
  NotFound = 'NotFound',
}

export interface IStoredDocumentResolution {
  readonly robotsIndex?: boolean;
  readonly kind: PublishedResolutionKind.StoredDocument;
  readonly releaseId: string;
  readonly documentPath: string;
  readonly markdownPath?: string;
}

export interface IRequestPlanResolution {
  readonly robotsIndex?: boolean;
  readonly kind: PublishedResolutionKind.RequestPlan;
  readonly releaseId: string;
  readonly renderPlanId: string;
}

export interface IRedirectResolution {
  readonly kind: PublishedResolutionKind.Redirect;
  readonly releaseId: string;
  readonly targetPath: string;
  readonly status: 301 | 308;
}

export interface INotFoundResolution {
  readonly kind: PublishedResolutionKind.NotFound;
}

export type PublishedResolution = IStoredDocumentResolution | IRequestPlanResolution
  | IRedirectResolution | INotFoundResolution;
