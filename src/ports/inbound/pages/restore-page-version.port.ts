import type { Page } from '../../../domain/pages/page.js';
import type { PublishedVersionPosition } from '../../../domain/pages/published-page-version.js';

export interface IRestorePageVersionInput {
  readonly siteId: string;
  readonly pageId: string;
  readonly version: PublishedVersionPosition;
}

export interface IRestorePageVersion {
  execute(input: IRestorePageVersionInput): Promise<Page>;
}
