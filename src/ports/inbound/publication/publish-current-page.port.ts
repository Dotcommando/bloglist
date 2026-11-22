import type { IPublishPageReleaseResult } from './publish-page-release.port.js';

export interface IPublishCurrentPageInput {
  readonly siteId: string;
  readonly pageId: string;
  readonly actorId: string;
  readonly templateId?: string;
  readonly path?: string;
}

export interface IPublishCurrentPage {
  execute(input: IPublishCurrentPageInput): Promise<IPublishPageReleaseResult>;
}
