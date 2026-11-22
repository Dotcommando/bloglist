import type {
  ISiteDump, ISiteDumpApplication, ISiteDumpCreation, ISiteDumpReview, SiteDumpType,
} from '../../../domain/dumps/site-dump.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface ISiteDumpAccess {
  /** Site indicates that only complete archives for the selected site are permitted. */
  requireAdministrator(siteId: string, actorId: string, actionId: string): Promise<SiteDumpType.Site | void>;
}

/** Complete, private site snapshots. Restoration replaces only the selected site's state. */
export interface ISiteDumpStore {
  create(siteId: string, options?: ISiteDumpCreation): Promise<ISiteDump>;
  list(siteId: string): Promise<readonly ISiteDump[]>;
  open(siteId: string, filename: string): Promise<ISiteDump & { readonly content: IBinaryContent }>;
  import(siteId: string, content: IBinaryContent, requiredType?: SiteDumpType.Site): Promise<ISiteDump>;
  restore(siteId: string, filename: string, options?: ISiteDumpApplication, actorId?: string, hookChange?:
  IHookCommitIntent, requiredType?: SiteDumpType.Site): Promise<void>;
  delete(siteId: string, filename: string): Promise<void>;
  exportItems(siteId: string, type: SiteDumpType): Promise<ISiteDumpReview>;
  inspect(siteId: string, filename: string): Promise<ISiteDumpReview>;
}

import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
