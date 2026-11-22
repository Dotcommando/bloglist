import type { IContentAccess } from '../../../domain/authorization/content-access.js';
import type { Page } from '../../../domain/pages/page.js';

export interface IGetPageInput {
  readonly authority?: IContentAccess;
  siteId: string;
  pageId: string;
}

export interface IGetPage {
  execute(input: IGetPageInput): Promise<Page | null>;
}
