import type { Page } from '../../../domain/pages/page.js';
import type { PageType } from '../../../domain/pages/page-type.enum.js';

export interface IUpdatePageInput {
  siteId: string;
  pageId: string;
  title?: string;
  h1?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  contentMd?: string;
  type?: PageType;
  robotsIndex?: boolean;
}

export interface IUpdatePage {
  execute(input: IUpdatePageInput): Promise<Page>;
}
