import type { Page } from '../../../domain/pages/page.js';

export interface IGetPageInput {
  pageId: string;
}

export interface IGetPage {
  execute(input: IGetPageInput): Promise<Page | null>;
}
