import type { IConfigureSiteAddon } from '../addons/configure-site-addon.port.js';
import type { IDisableSiteAddon } from '../addons/disable-site-addon.port.js';
import type { IEnableSiteAddon } from '../addons/enable-site-addon.port.js';
import type { IGetSiteAddon } from '../addons/get-site-addon.port.js';
import type { IListSiteAddons } from '../addons/list-site-addons.port.js';
import type { IBlockAdminUser } from '../admin-users/block-admin-user.port.js';
import type { IDeleteAdminUser } from '../admin-users/delete-admin-user.port.js';
import type { IGetAdminUser } from '../admin-users/get-admin-user.port.js';
import type { IListAdminUsers } from '../admin-users/list-admin-users.port.js';
import type { IUpdateAdminUser } from '../admin-users/update-admin-user.port.js';
import type { IHookConfigurationOperations } from '../hooks/hook-configuration.port.js';
import type { IGetHookHistory, IRetryHookDelivery, ISkipHookDelivery } from '../hooks/hook-execution.port.js';
import type { IFileLibraryOperations, IProgrammaticFiles, IStreamMediaUpload } from '../media/file-library.port.js';
import type { IGetAsset } from '../media/get-asset.port.js';
import type { IProcessAsset } from '../media/process-asset.port.js';
import type { IUploadAsset } from '../media/upload-asset.port.js';
import type { IArchivePage } from '../pages/archive-page.port.js';
import type { IConfigurePageRendering } from '../pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../pages/create-page.port.js';
import type { IGetPage } from '../pages/get-page.port.js';
import type { IListPages } from '../pages/list-pages.port.js';
import type { IMovePage } from '../pages/move-page.port.js';
import type { IPublishPage } from '../pages/publish-page.port.js';
import type { IRestorePageVersion } from '../pages/restore-page-version.port.js';
import type { IUpdatePage } from '../pages/update-page.port.js';
import type { IGetPublicationOptions } from '../publication/get-publication-options.port.js';
import type { IGetPublishedArtifact } from '../publication/get-published-artifact.port.js';
import type { IPreviewPage } from '../publication/preview-page.port.js';
import type { IPublishCurrentPage } from '../publication/publish-current-page.port.js';
import type { IPublishPageRelease } from '../publication/publish-page-release.port.js';
import type { IPublishRoutingRelease } from '../publication/publish-routing-release.port.js';
import type { IPublishSiteRelease } from '../publication/publish-site-release.port.js';
import type { IRenderPublishedPage } from '../publication/render-published-page.port.js';
import type { IRepublishSnippetPages } from '../publication/republish-snippet-pages.port.js';
import type { IResolvePublishedPath } from '../publication/resolve-published-path.port.js';
import type { IRenderingOperations } from '../rendering/rendering-elements.port.js';
import type { IAssignInitialPageUrl } from '../routing/assign-initial-page-url.port.js';
import type { IChangePageUrl } from '../routing/change-page-url.port.js';
import type { IChangePublishedPageUrl } from '../routing/change-published-page-url.port.js';
import type { IFindUrlByPath } from '../routing/find-url-by-path.port.js';
import type { IGetUrlCatalog } from '../routing/get-url-catalog.port.js';
import type { IGetUrlHistory } from '../routing/get-url-history.port.js';
import type { IMaterializeVirtualUrl } from '../routing/materialize-virtual-url.port.js';
import type { IRebindUrlToPage } from '../routing/rebind-url-to-page.port.js';
import type { IRedirectPublishedUrl } from '../routing/redirect-published-url.port.js';
import type { IRedirectUrl } from '../routing/redirect-url.port.js';
import type { ISearchUrls } from '../routing/search-urls.port.js';
import type { IArchiveSite } from '../sites/archive-site.port.js';
import type { ICreateSite } from '../sites/create-site.port.js';
import type { IGetSite } from '../sites/get-site.port.js';
import type { IListSites } from '../sites/list-sites.port.js';
import type { IResolveSite } from '../sites/resolve-site.port.js';
import type { IUpdateSite } from '../sites/update-site.port.js';
import type { ITemplateVariableOperations } from '../template-variables/template-variables.port.js';
import type { ICmsFileUsages } from './cms-file-usages.port.js';
import type { IGetPublishedPage, IListPageVersions } from './published-pages.port.js';

export interface ICmsCoreOperations {
  readonly sites: {
    readonly create: ICreateSite;
    readonly get: IGetSite;
    readonly resolve: IResolveSite;
    readonly list: IListSites;
    readonly update: IUpdateSite;
    readonly archive: IArchiveSite;
  };
  readonly pages: {
    readonly create: ICreatePage;
    readonly get: IGetPage;
    readonly list: IListPages;
    readonly update: IUpdatePage;
    readonly move: IMovePage;
    readonly archive: IArchivePage;
    readonly configureRendering: IConfigurePageRendering;
    readonly publish: IPublishPage;
    readonly restoreVersion: IRestorePageVersion;
    readonly preview: IPreviewPage;
    readonly getPublicationOptions: IGetPublicationOptions;
    readonly publishCurrent: IPublishCurrentPage;
    readonly publishRelease: IPublishPageRelease;
    readonly getDraft: IGetPage;
    readonly getPublished: IGetPublishedPage;
    readonly listVersions: IListPageVersions;
  };
  readonly urls: {
    readonly assignInitial: IAssignInitialPageUrl;
    readonly findByPath: IFindUrlByPath;
    readonly change: IChangePageUrl;
    readonly getHistory: IGetUrlHistory;
    readonly getCatalog: IGetUrlCatalog;
    readonly search: ISearchUrls;
    readonly changePublished: IChangePublishedPageUrl;
    readonly materialize: IMaterializeVirtualUrl;
    readonly rebind: IRebindUrlToPage;
    readonly redirect: IRedirectUrl;
    readonly redirectPublished: IRedirectPublishedUrl;
  };
  readonly publication: {
    readonly publishSite: IPublishSiteRelease;
    readonly publishRouting: IPublishRoutingRelease;
    readonly resolvePath: IResolvePublishedPath;
    readonly renderPage: IRenderPublishedPage;
    readonly getArtifact: IGetPublishedArtifact;
    readonly republishSnippetPages: IRepublishSnippetPages;
  };
  readonly addons: {
    readonly list: IListSiteAddons;
    readonly get: IGetSiteAddon;
    readonly enable: IEnableSiteAddon;
    readonly configure: IConfigureSiteAddon;
    readonly disable: IDisableSiteAddon;
  };
  readonly adminUsers: {
    readonly get: IGetAdminUser;
    readonly list: IListAdminUsers;
    readonly update: IUpdateAdminUser;
    readonly block: IBlockAdminUser;
    readonly delete: IDeleteAdminUser;
  };

  readonly templates: IRenderingOperations;
  readonly chunks: IRenderingOperations;
  readonly snippets: IRenderingOperations;
  readonly tvs: ITemplateVariableOperations;
  readonly files: Omit<IFileLibraryOperations, 'usages'> & IProgrammaticFiles & {
    readonly getFile: { execute: IFileLibraryOperations['browse']['file'] };
    readonly getFiles: { execute(input: { readonly siteId: string; readonly fileIds: readonly string[] }):
    Promise<readonly (Awaited<ReturnType<IFileLibraryOperations['browse']['file']>> | null)[]> };
    readonly usages: ICmsFileUsages;
    readonly getAsset: IGetAsset;
    readonly uploadAsset: IUploadAsset;
    readonly processAsset: IProcessAsset;
  };
  readonly hooks: IHookConfigurationOperations & {
    readonly history: IGetHookHistory;
    readonly retry: IRetryHookDelivery;
    readonly skip: ISkipHookDelivery;
  };
}

export type CmsData<T> = T extends undefined ? undefined : T extends void ? null
  : T extends string | number | boolean | null ? T
    : T extends { toState(): infer S } ? CmsData<S>
      : T extends Date ? string
        : T extends bigint ? string
          : T extends AsyncIterable<Uint8Array> ? readonly number[]
            : T extends readonly (infer E)[] ? readonly CmsData<E>[]
              : {
                readonly [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: CmsData<T[K]>;
              };

export enum CmsSortDirection { Ascending = 'asc', Descending = 'desc' }

export interface ICmsListInput {
  readonly limit?: number;
  readonly offset?: number;
  readonly sortby?: readonly { readonly field: string; readonly direction: CmsSortDirection }[];
  readonly filter?: Readonly<Record<string, string | number | boolean | null>>;
  readonly parentId?: string | null;
}

export interface ICmsList<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

type ListItem<T> = T extends readonly (infer E)[] ? E
  : T extends { readonly items: readonly (infer E)[] } ? E
    : T extends { readonly fields: readonly (infer E)[] } ? E
      : T extends { readonly files: readonly (infer E)[] } ? E
        : T extends { readonly hooks: readonly (infer E)[] } ? E : never;

import type { CmsExtensions } from '../../outbound/cms/cms-extension.port.js';

export type CmsApi = { readonly extensions: CmsExtensions } & {
  readonly [G in keyof ICmsCoreOperations]: {
    readonly [M in keyof ICmsCoreOperations[G]]: M extends 'list' | 'listVersions' | 'getHistory' | 'history'
      ? (input?: ICmsListInput & Partial<CmsScopedOperationInput<G, ICmsCoreOperations[G][M]>>) =>
      Promise<ICmsList<ListItem<CmsOperationResult<ICmsCoreOperations[G][M]>>>>
      : (input: G extends 'files' ? M extends 'uploadFile'
        ? Omit<IStreamMediaUpload, 'siteId'>
        : M extends 'uploadBatch' ? { readonly files: readonly Omit<IStreamMediaUpload, 'siteId'>[] }
          : CmsScopedOperationInput<G, ICmsCoreOperations[G][M]>
        : CmsScopedOperationInput<G, ICmsCoreOperations[G][M]>) =>
      Promise<CmsOperationResult<ICmsCoreOperations[G][M]>>;
  };
};

export type CmsOperationInput<T> = T extends { execute(...args: infer A): unknown }
  ? A extends [infer I, ...unknown[]]
    ? Omit<CmsData<I>, 'siteId' | 'actorId' | 'signal'> : Record<never, never>
  : never;

type CmsScopedOperationInput<G, T> = G extends 'templates' | 'chunks' | 'snippets'
  ? Omit<CmsOperationInput<T>, 'kind'> : CmsOperationInput<T>;

export type CmsOperationResult<T> = T extends { execute(...args: never[]): Promise<infer R> } ? CmsData<R> : never;
