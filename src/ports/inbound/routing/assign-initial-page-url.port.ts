import type { Url } from '../../../domain/routing/url.js';

export interface IAssignInitialPageUrlInput {
  siteId: string;
  pageId: string;
  mark: string;
  parentUrlId: string | null;
  segment: string;
  path: string;
}

export interface IAssignInitialPageUrl {
  execute(input: IAssignInitialPageUrlInput): Promise<Url>;
}
