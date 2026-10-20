import type { Url } from '../../../domain/routing/url.js';
import type { UrlRedirectStatus } from '../../../domain/routing/url-redirect-status.enum.js';

export interface IChangePageUrlInput {
  siteId: string;
  pageId: string;
  mark: string;
  parentUrlId: string | null;
  segment: string;
  path: string;
  redirectStatus: UrlRedirectStatus;
}

export interface IChangePageUrl {
  execute(input: IChangePageUrlInput): Promise<Url>;
}
