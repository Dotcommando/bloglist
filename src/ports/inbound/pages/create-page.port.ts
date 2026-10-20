import type { Page } from '../../../domain/pages/page.js';
import type { PageType } from '../../../domain/pages/page-type.enum.js';

export interface ICreatePageInput {
  mark: string;
  siteId: string;
  language: string;
  title: string;
  clusterId?: string | null;
  type?: PageType;
  h1?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  contentMd?: string;
  robotsIndex?: boolean;
}

export interface ICreatePage {
  execute(input: ICreatePageInput): Promise<Page>;
}
