import type { Page } from '../../../domain/pages/page.js';
import type { IPageFilter } from '../../../domain/pages/page-filter.js';

export interface IListPagesInput {
  siteId: string;
  filter?: IPageFilter;
}

export interface IListPages {
  execute(input: IListPagesInput): Promise<Page[]>;
}
