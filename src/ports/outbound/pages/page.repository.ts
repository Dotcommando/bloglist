import type { Page } from '../../../domain/pages/page.js';
import type { IPageFilter } from '../../../domain/pages/page-filter.js';

export interface IPageRepository {
  findById(pageId: string): Promise<Page | null>;
  /** Global case-insensitive mark lookup. */
  findByMark(mark: string): Promise<Page | null>;
  findBySite(siteId: string, filter?: IPageFilter): Promise<Page[]>;
  findByCluster(clusterId: string): Promise<Page[]>;
  /** Enforce mark uniqueness atomically; translate technical conflicts into PageConflictError. */
  save(page: Page): Promise<Page>;
}
