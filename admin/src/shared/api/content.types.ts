import type { ICrawlerDiagnostic, SystemDocument } from '../../features/pages/crawler.types.js';
import type { TvValue } from '../../features/template-variables/template-variables.types.js';

export interface IAdminSite {
  siteId: string;
  mark: string;
  name: string;
  primaryDomain: string;
  languages: string[];
  defaultLanguage: string;
  status: string;
}

export enum OpenGraphType { Website = 'website', Article = 'article' }

export interface IPageMetadata {
  mimeType?: string;
  excludeFromSitemap?: boolean;
  h1: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  robotsIndex: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogType: OpenGraphType | null;
}

export interface IAdminPage extends IPageMetadata {
  rendering?: {
    templateId: string;
    delivery: string;
    interaction: string;
    parameters: unknown;
    loaders: unknown;
    requestCache?: IRequestCachePolicy | null;
  };
  systemDocument?: SystemDocument | null;
  tvValues?: Record<string, TvValue>;
  authoredTvValues?: Record<string, TvValue>;
  updatedAt?: string;
  pageNumber: string | null;
  parentPageId: string | null;
  sortOrder: number;
  pageId: string;
  siteId: string;
  mark: string;
  title: string;
  language: string;
  status: string;
  contentMd: string;
}

export interface ISiteCreation {
  onboarding: { localAddress: string; originMode: SiteOriginMode };
  mark: string;
  name: string;
  primaryDomain: string;
  languages: string[];
  defaultLanguage: string;
}

export enum RequestCacheScope { SharedPublic = 'SharedPublic' }

export interface IRequestCachePolicy { scope: RequestCacheScope; ttlMs: number }

export interface IPageCreation extends Partial<IPageMetadata> {
  requestCache?: IRequestCachePolicy | null;
  parentPageId?: string | null;
  sortOrder?: number;
  mark: string;
  title: string;
  language: string;
  contentMd: string;
}

export interface IPageEditorialState {
  pageId: string;
  hasPublishedVersion: boolean;
  changedFields: string[];
}

export interface IPageEditorialStates {
  releaseId: string | null;
  pages: IPageEditorialState[];
  publishedPage: (IAdminPage & { rendering?: {
    templateId: string;
    delivery: string;
    interaction: string;
    parameters: unknown;
    loaders: unknown;
    requestCache?: IRequestCachePolicy | null;
  } }) | null;
  robotsHasUnpublishedChanges: boolean;
}

export interface IPublicationOptions {
  editorial?: IPageEditorialStates;
  requestDelivery?: boolean;
  requestCache?: IRequestCachePolicy | null;
  mimeTypes?: string[];
  generatedContent?: string | null;
  crawlerDiagnostics?: ICrawlerDiagnostic[];
  pageAvailability: IPageAvailability[];
  templates: { templateId: string; name: string; requiresParameters: boolean }[];
  templateId: string | null;
  path: string | null;
}

export interface IPageAvailability {
  pageId: string;
  assignedPath: string | null;
  publicPath: string | null;
}

export enum PageSaveIntent { Draft = 'draft', Publish = 'publish' }

export enum PageEditorTab {
  Main = 'main', Seo = 'seo', OpenGraph = 'openGraph', TemplateVariables = 'templateVariables',
}

export interface IPageEditorBuffer {
  requestCacheEnabled?: boolean;
  requestCacheSeconds?: number;
  markEdited?: boolean;
  fallbackMark?: string;
  tvValues?: Record<string, TvValue>;
  parentPageId: string | null;
  sortOrder: number | null;
  title: string;
  content: string;
  mark: string;
  language: string;
  templateId: string;
  path: string;
  pathEdited: boolean;
  metadata: IPageMetadata;
}

export enum WorkspaceNotice {
  DraftSaved = 'draftSaved',
  PagePublished = 'pagePublished',
  SitePublished = 'sitePublished',
}

export enum WorkspaceView {
  Loading = 'loading',
  Sites = 'sites',
  CreateSite = 'create-site',
  Site = 'site',
  NotFound = 'not-found',
  NoSiteAccess = 'no-site-access',
}

export enum WorkspacePanel { Tree = 'tree', Editor = 'editor' }

export enum PublicationFeedback {
  Invalid = 'publicationInvalid',
  Failed = 'publicationFailed',
  Conflict = 'publicationConflict',
  SavedDraftUnconfirmed = 'savedDraftPublicationUnconfirmed',
}

import type { SiteOriginMode } from '../../features/urls/urls.types.js';
