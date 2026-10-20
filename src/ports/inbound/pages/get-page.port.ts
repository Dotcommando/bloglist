import type { Page } from '../../../domain/pages/page.js';

export interface IGetPageInput {
  siteId: string;
  pageId: string;
}

export interface IGetPage {
  execute(input: IGetPageInput): Promise<Page | null>;
}
