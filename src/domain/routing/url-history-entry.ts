import type { UrlKind } from './url-kind.enum.js';
import type { UrlRedirectStatus } from './url-redirect-status.enum.js';

export interface IUrlHistoryEntry {
  readonly urlHistoryEntryId: string;
  readonly urlId: string;
  readonly kind: UrlKind;
  readonly pageId: string | null;
  readonly redirectTargetUrlId: string | null;
  readonly redirectStatus: UrlRedirectStatus | null;
  readonly createdAt: Date;
}
