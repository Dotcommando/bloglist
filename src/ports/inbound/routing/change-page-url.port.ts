import type { OldUrlAction } from '../../../domain/routing/old-url-action.enum.js';
import type { Url } from '../../../domain/routing/url.js';
import type { ChildrenUrlAction, IncomingRedirectAction } from '../../../domain/routing/url-move-options.js';
import type { UrlRedirectStatus } from '../../../domain/routing/url-redirect-status.enum.js';

export interface IChangePageUrlInput {
  /** With the existing path, update only its parent while retaining identity and address. */
  /** Redirect by default; Delete explicitly removes the old working URL and its history. */
  oldUrlAction?: OldUrlAction;
  childrenAction?: ChildrenUrlAction;
  incomingRedirectAction?: IncomingRedirectAction;
  /** When supplied, reject a move from a different current address. */
  expectedUrlId?: string;
  siteId: string;
  pageId: string;
  mark: string;
  parentUrlId: string | null;
  segment: string;
  path: string;
  redirectStatus: UrlRedirectStatus;
  /** False by default; true moves every descendant atomically and retains old addresses as redirects. */
  moveSubtree?: boolean;
}

export interface IChangePageUrl {
  execute(input: IChangePageUrlInput): Promise<Url>;
}
