import type { IContentCreationAccess } from '../../../domain/authorization/content-access.js';
import type { OpenGraphType } from '../../../domain/pages/open-graph-type.enum.js';
import type { Page } from '../../../domain/pages/page.js';
import type { PageType } from '../../../domain/pages/page-type.enum.js';

export interface ICreatePageInput extends IContentCreationAccess {
  mimeType?: string;
  excludeFromSitemap?: boolean;
  parentPageId?: string | null;
  sortOrder?: number;
  mark: string;
  siteId: string;
  language: string;
  title: string;
  clusterId?: string | null;
  type?: PageType;
  h1?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  ogType?: OpenGraphType | null;
  contentMd?: string;
  robotsIndex?: boolean;
}

export interface ICreatePage {
  execute(input: ICreatePageInput): Promise<Page>;
}
