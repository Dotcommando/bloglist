import type { Page } from '../../../domain/pages/page.js';

export interface IArchivePageInput {
  pageId: string;
}

export interface IArchivePage {
  execute(input: IArchivePageInput): Promise<Page>;
}
