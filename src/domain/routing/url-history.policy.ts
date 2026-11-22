import type { IUrlHistoryEntry } from './url-history-entry.js';
import { UrlKind } from './url-kind.enum.js';
import { UrlRedirectStatus } from './url-redirect-status.enum.js';

export function validateUrlHistory(entry: IUrlHistoryEntry): void {
  if (
    !entry.urlId.trim()
    || !entry.urlHistoryEntryId.trim()
    || !Number.isFinite(entry.createdAt.getTime())
    || !Object.values(UrlKind).includes(entry.kind)
  ) {
    throw new RangeError('Invalid URL history identity or time');
  }
  if (
    entry.kind === UrlKind.PAGE
    && (!entry.pageId?.trim()
    || entry.redirectTargetUrlId !== null
    || entry.redirectStatus !== null)
  ) {
    throw new RangeError('Invalid previous PAGE behavior');
  }
  if (
    entry.kind === UrlKind.REDIRECT
    && (entry.pageId !== null
    || !entry.redirectTargetUrlId?.trim()
    || entry.redirectTargetUrlId === entry.urlId
    || entry.redirectStatus === null
    || ![UrlRedirectStatus.HTTP_301, UrlRedirectStatus.HTTP_308].includes(entry.redirectStatus))
  ) {
    throw new RangeError('Invalid previous REDIRECT behavior');
  }
}
