import type { ICreatePage } from '../../../../ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../../../../ports/inbound/pages/get-page.port.js';
import type { IListPages } from '../../../../ports/inbound/pages/list-pages.port.js';
import type { IMovePage } from '../../../../ports/inbound/pages/move-page.port.js';
import type {
  IRewritePageMediaReferences,
} from '../../../../ports/inbound/pages/rewrite-page-media-references.port.js';
import type { IUpdatePage } from '../../../../ports/inbound/pages/update-page.port.js';
import type { ICreateSite } from '../../../../ports/inbound/sites/create-site.port.js';
import type { IGetSite } from '../../../../ports/inbound/sites/get-site.port.js';
import type { IListSites } from '../../../../ports/inbound/sites/list-sites.port.js';

export interface IAdminContentOperations {
  readonly movePage: IMovePage;
  readonly createSite: ICreateSite;
  readonly getSite: IGetSite;
  readonly listSites: IListSites;
  readonly createPage: ICreatePage;
  readonly getPage: IGetPage;
  readonly listPages: IListPages;
  readonly updatePage: IUpdatePage;
  readonly rewritePageMedia: IRewritePageMediaReferences;
}

export interface IAdminContentOperationFactory {
  forSession(token: string | null): IAdminContentOperations;
}
