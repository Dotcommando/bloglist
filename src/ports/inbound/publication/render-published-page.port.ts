import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import type { DocumentRepresentation, IPublishedDocument } from '../../../domain/publication/published-document.js';

export interface IRenderPublishedPageInput {
  readonly siteId: string;
  readonly releaseId: string;
  readonly renderPlanId: string;
  readonly requestValues?: ITemplateObject;
  readonly path?: string | undefined;
  readonly sharedCacheAllowed?: boolean;
  readonly signal?: AbortSignal;
  readonly representation?: DocumentRepresentation;
}

export interface IRenderPublishedPage {
  execute(input: IRenderPublishedPageInput): Promise<IPublishedDocument>;
}
