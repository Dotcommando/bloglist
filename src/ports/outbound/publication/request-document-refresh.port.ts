import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import type {
  DocumentRepresentation, IPublishedDocument, IStoredRequestPlan,
} from '../../../domain/publication/published-document.js';

export interface IRequestDocumentGeneration {
  readonly stored: IStoredRequestPlan;
  readonly values: ITemplateObject;
  readonly representation?: DocumentRepresentation;
}

export interface IRequestDocumentRefreshPort {
  regenerate(input: IRequestDocumentGeneration, signal: AbortSignal): Promise<IPublishedDocument>;
}
