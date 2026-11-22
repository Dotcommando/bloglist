import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { ISiteState, Site } from '../../../domain/sites/site.js';

export interface ISiteUpdateStorePort {
  /** Guard captured state and language usage against concurrent page creation; save all or nothing. */
  saveUpdate(previous: ISiteState, next: Site, hookChange?: IHookCommitIntent): Promise<Site>;
}

export interface ISitePageLanguageUsagePort {
  hasPages(siteId: string, languages: readonly string[]): Promise<boolean>;
}
