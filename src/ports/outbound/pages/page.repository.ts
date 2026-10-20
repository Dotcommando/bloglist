import type { Page } from '../../../domain/pages/page.js';
import type { IPageFilter } from '../../../domain/pages/page-filter.js';

export interface IPageRepository {
  findById(pageId: string): Promise<Page | null>;
  findByMark(mark: string): Promise<Page | null>;
  findBySite(siteId: string, filter?: IPageFilter): Promise<Page[]>;
  findByCluster(clusterId: string): Promise<Page[]>;
  save(page: Page): Promise<Page>;
}
