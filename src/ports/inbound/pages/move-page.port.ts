import type { Page } from '../../../domain/pages/page.js';

export interface IMovePageInput {
  readonly siteId: string;
  readonly pageId: string;
  readonly parentPageId: string | null;
  readonly expectedParentPageId: string | null;
  readonly expectedSortOrder: number;
}

export interface IMovePage {
  execute(input: IMovePageInput): Promise<Page>;
}
