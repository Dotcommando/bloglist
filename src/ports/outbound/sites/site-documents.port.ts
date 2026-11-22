import type { IPageState } from '../../../domain/pages/page.js';
import type { IUrlState } from '../../../domain/routing/url.js';

export interface ISiteDocumentSeed {
  readonly page: IPageState;
  readonly url: IUrlState;
}

export interface ISiteDocumentValues {
  nextPageId(): string;
  nextUrlId(): string;
  now(): Date;
}

export interface ISiteDocumentsPort {
  /** Atomically establish exactly the initial protected documents; retries return their retained content. */
  ensure(siteId: string, documents: readonly ISiteDocumentSeed[]): Promise<readonly ISiteDocumentSeed[]>;
}
