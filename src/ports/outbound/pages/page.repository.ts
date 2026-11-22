import type { IContentAccess } from '../../../domain/authorization/content-access.js';
import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { IPageState, Page } from '../../../domain/pages/page.js';
import type { IPageFilter } from '../../../domain/pages/page-filter.js';
import type { IPageSaveAccess } from './page-creation.port.js';

export interface IPageRepository {
  findById(pageId: string, access?: IContentAccess): Promise<Page | null>;
  /** Case-insensitive mark lookup within the trusted site. */
  findByMark(siteId: string, mark: string): Promise<Page | null>;
  findBySite(siteId: string, filter?: IPageFilter, access?: IContentAccess): Promise<Page[]>;
  findByCluster(clusterId: string): Promise<Page[]>;
  /** Enforce site-scoped mark uniqueness atomically; translate technical conflicts into PageConflictError. */
  save(page: Page, hookChange?: IHookCommitIntent, expected?: IPageState,
    access?: IPageSaveAccess): Promise<Page>;
}
