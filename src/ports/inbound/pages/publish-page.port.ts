import type { Page } from '../../../domain/pages/page.js';

export interface IPublishPageInput {
  pageId: string;
}

export interface IPublishPage {
  execute(input: IPublishPageInput): Promise<Page>;
}
