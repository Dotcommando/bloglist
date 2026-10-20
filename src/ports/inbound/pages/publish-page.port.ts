import type { Page } from '../../../domain/pages/page.js';

export interface IPublishPageInput {
  siteId: string;
  pageId: string;
}

export interface IPublishPage {
  execute(input: IPublishPageInput): Promise<Page>;
}
