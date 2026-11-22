import type { Page } from '../../../domain/pages/page.js';
import type { IActivePublication } from '../../../domain/publication/publication-release.js';

export interface IPublishPageReleaseInput {
  readonly siteId: string;
  readonly pageId: string;
  readonly actorId?: string;
}

export interface IPublishPageReleaseResult {
  readonly page: Page;
  readonly publication: IActivePublication;
}

export interface IPublishPageRelease {
  execute(input: IPublishPageReleaseInput): Promise<IPublishPageReleaseResult>;
}
