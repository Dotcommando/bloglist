import type { IContentAccess } from '../../../domain/authorization/content-access.js';
import type { OpenGraphType } from '../../../domain/pages/open-graph-type.enum.js';
import type { Page } from '../../../domain/pages/page.js';
import type { PageType } from '../../../domain/pages/page-type.enum.js';
import type { IRequestCachePolicy } from '../../../domain/publication/request-cache.policy.js';

export interface IUpdatePageInput {
  readonly authority?: IContentAccess;
  requestCache?: IRequestCachePolicy | null;
  mimeType?: string;
  excludeFromSitemap?: boolean;
  sortOrder?: number;
  siteId: string;
  pageId: string;
  title?: string;
  h1?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  ogType?: OpenGraphType | null;
  contentMd?: string;
  type?: PageType;
  robotsIndex?: boolean;
}

export interface IUpdatePage {
  execute(input: IUpdatePageInput): Promise<Page>;
}
