export enum UrlKind { Page = 'PAGE', Redirect = 'REDIRECT' }

export enum SiteOriginMode { Public = 'Public', Local = 'Local' }

export type IVirtualUrlCommand = { path: string } & (
  { kind: UrlKind.Page; pageId: string }
  | { kind: UrlKind.Redirect; targetUrlId: string; redirectStatus: number }
);

export enum UrlSearchPurpose { Parent = 'Parent', Redirect = 'Redirect' }

export interface IUrlSuggestion { siteId: string; urlId: string; path: string; kind: UrlKind; }

export enum OldUrlAction { Redirect = 'Redirect', Delete = 'Delete' }

export enum ChildrenUrlAction {
  Keep = 'Keep', PromoteWithRedirect = 'PromoteWithRedirect', PromoteWithoutRedirect = 'PromoteWithoutRedirect',
}

export enum IncomingRedirectAction { Retarget = 'Retarget', Delete = 'Delete' }

export enum PublishedUrlKind { Static = 'Static', Request = 'Request', Redirect = 'Redirect' }

export interface ISiteAddresses { publicOrigin: string | null;
  localOrigin: string | null;
  originMode?: SiteOriginMode; }

export function servingSiteOrigin(addresses: ISiteAddresses): string | null {
  return addresses.originMode === SiteOriginMode.Local ? addresses.localOrigin : addresses.publicOrigin;
}

export interface IUrlState {
  urlId: string;
  siteId: string;
  mark: string;
  path: string;
  segment: string;
  parentUrlId: string | null;
  kind: UrlKind;
  pageId: string | null;
  redirectTargetUrlId: string | null;
  redirectStatus: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface IUrlRow { url: IUrlState; version: string; }

export interface IPublishedUrl {
  urlId: string;
  path: string;
  kind: PublishedUrlKind;
  pageId?: string;
  targetPath?: string;
  targetUrlId?: string;
  status?: number;
}

export interface IUrlPage { pageId: string; title: string; language: string; status: string; robotsIndex: boolean; }

export interface IUrlCatalog {
  siteId: string;
  urls: IUrlRow[];
  pages: IUrlPage[];
  published: { releaseId: string; routes: IPublishedUrl[]; sitemapPaths: string[] | null } | null;
}

export interface IUrlHistory {
  kind: UrlKind;
  pageId: string | null;
  redirectTargetUrlId: string | null;
  redirectStatus: number | null;
  createdAt: string;
}

export interface IUrlNode {
  path: string;
  parent: string | null;
  row: IUrlRow | null;
  live: IPublishedUrl | null;
  inSitemap: boolean;
}
