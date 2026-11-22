import { object, request, string } from '../../shared/api/content-api';
import type { ChildrenUrlAction, IncomingRedirectAction, OldUrlAction } from './urls.types';
import type { IUrlSuggestion, UrlSearchPurpose } from './urls.types';
import type { IVirtualUrlCommand } from './urls.types';
import {
  type ISiteAddresses, type IUrlCatalog, type IUrlHistory, type IUrlState, PublishedUrlKind, SiteOriginMode,
  UrlKind,
} from './urls.types';

export async function materializeVirtualUrl(siteId: string, input: IVirtualUrlCommand): Promise<{
  url: IUrlState; publicationFailed: boolean; activated: boolean;
}> {
  const result = object(await request('/' + siteId + '/urls/virtual', input, 120000));

  if (
    typeof result.publicationFailed !== 'boolean'
    || result.publication !== null
    && object(result.publication).siteId !== siteId
  ) {
    throw new Error('Invalid virtual URL result');
  }

  return {
    url: url(result.url, siteId), publicationFailed: result.publicationFailed, activated: result.publication !== null,
  };
}

function nullable(value: unknown): string | null {
  return value === null ? null : string(value);
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid list');
  }

  return value;
}

function status(value: unknown): number | null {
  if (value !== null && value !== 301 && value !== 308) {
    throw new Error('Invalid redirect status');
  }

  return value;
}

function kind(value: unknown): UrlKind {
  if (value !== UrlKind.Page && value !== UrlKind.Redirect) {
    throw new Error('Invalid URL kind');
  }

  return value;
}

export async function searchUrls(siteId: string, currentUrlId: string, purpose: UrlSearchPurpose,
  query: string, offset: number): Promise<IUrlSuggestion[]> {
  const params = new URLSearchParams({ currentUrlId, purpose, q: query, limit: '10', offset: String(offset) });
  const result = object(await request('/' + siteId + '/urls/suggestions?' + params));

  if (result.siteId !== siteId || !Array.isArray(result.items) || result.items.length > 10) {
    throw new Error('Invalid URL suggestions');
  }

  return result.items.map((value) => {
    const row = object(value);

    if (row.siteId !== siteId) {
      throw new Error('Foreign URL suggestion');
    }

    return { siteId, urlId: string(row.urlId), path: string(row.path), kind: kind(row.kind) };
  });
}

function url(value: unknown, siteId: string): IUrlState {
  const row = object(value);

  if (row.siteId !== siteId) {
    throw new Error('Foreign URL');
  }

  return {
    urlId: string(row.urlId),
    siteId,
    mark: string(row.mark),
    path: string(row.path),
    segment: string(row.segment),
    parentUrlId: nullable(row.parentUrlId),
    kind: kind(row.kind),
    pageId: nullable(row.pageId),
    redirectTargetUrlId: nullable(row.redirectTargetUrlId),
    redirectStatus: status(row.redirectStatus),
    createdAt: string(row.createdAt),
    updatedAt: string(row.updatedAt),
  };
}

export async function getUrlCatalog(siteId: string): Promise<IUrlCatalog> {
  const result = object(await request('/' + siteId + '/urls'));

  if (result.siteId !== siteId) {
    throw new Error('Foreign catalog');
  }

  const published = result.published === null ? null : object(result.published);

  return {
    siteId,
    urls: array(result.urls).map((item) => {
      const row = object(item);

      return { url: url(row.url, siteId), version: string(row.version) };
    }),
    pages: array(result.pages).map((item) => {
      const row = object(item);

      if (typeof row.robotsIndex !== 'boolean') {
        throw new Error('Invalid indexing flag');
      }

      return {
        pageId: string(row.pageId),
        title: string(row.title),
        language: string(row.language),
        status: string(row.status),
        robotsIndex: row.robotsIndex,
      };
    }),
    published: published ? {
      releaseId: string(published.releaseId),
      sitemapPaths: published.sitemapPaths === null ? null : array(published.sitemapPaths).map(string),
      routes: array(published.routes).map((item) => {
        const row = object(item);

        if (
          row.kind !== PublishedUrlKind.Static
          && row.kind !== PublishedUrlKind.Request
          && row.kind
          !== PublishedUrlKind.Redirect
        ) {
          throw new Error('Invalid published route');
        }

        return {
          urlId: string(row.urlId),
          path: string(row.path),
          kind: row.kind,
          ...(row.pageId === undefined ? {} : { pageId: string(row.pageId) }),
          ...(row.targetPath === undefined ? {} : { targetPath: string(row.targetPath) }),
          ...(row.targetUrlId === undefined ? {} : { targetUrlId: string(row.targetUrlId) }),
          ...(row.status === undefined ? {} : { status: status(row.status)! }),
        };
      }),
    } : null,
  };
}

export async function getUrlHistory(siteId: string, urlId: string): Promise<IUrlHistory[]> {
  const result = object(await request('/' + siteId + '/urls/' + urlId + '/history'));

  return array(result.items).map((item) => {
    const row = object(item);

    return {
      kind: kind(row.kind),
      pageId: nullable(row.pageId),
      redirectTargetUrlId: nullable(row.redirectTargetUrlId),
      redirectStatus: status(row.redirectStatus),
      createdAt: string(row.createdAt),
    };
  });
}

export async function moveUrl(siteId: string, current: IUrlState, path: string, parentUrlId: string | null,
  redirectStatus: number, oldUrlAction: OldUrlAction, childrenAction: ChildrenUrlAction,
  incomingRedirectAction: IncomingRedirectAction): Promise<{
  url: IUrlState; activated: boolean; publicationFailed: boolean;
}> {
  const result = object(await request('/' + siteId + '/urls/' + current.urlId + '/move',
    {
      pageId: current.pageId,
      path,
      parentUrlId,
      moveSubtree: false,
      redirectStatus,
      oldUrlAction,
      childrenAction,
      incomingRedirectAction,
    }, 120000));

  if (
    typeof result.publicationFailed !== 'boolean'
    || result.publication !== null
    && object(result.publication).siteId !== siteId
  ) {
    throw new Error('Invalid routing publication result');
  }

  return {
    url: url(result.url, siteId),
    activated: result.publication !== null,
    publicationFailed: result.publicationFailed,
  };
}

export async function publishRouting(siteId: string): Promise<boolean> {
  const result = object(await request('/' + siteId + '/urls/publish', {}, 120000));

  if (result.publication !== null && object(result.publication).siteId !== siteId) {
    throw new Error('Foreign routing publication');
  }

  return result.publication !== null;
}

export async function redirectUrl(siteId: string, urlId: string, expectedVersion: string,
  targetUrlId: string, redirectStatus: number): Promise<{
  url: IUrlState; activated: boolean; publicationFailed: boolean;
}> {
  const result = object(await request('/' + siteId + '/urls/' + urlId + '/redirect', {
    expectedVersion,
    targetUrlId,
    redirectStatus,
  }, 120000));
  const savedUrl = url(result.url, siteId);

  if (
    typeof result.publicationFailed !== 'boolean'
    || result.publication !== null
    && object(result.publication).siteId !== siteId
  ) {
    throw new Error('Invalid redirect publication result');
  }

  return { url: savedUrl, activated: result.publication !== null, publicationFailed: result.publicationFailed };
}

function readAddresses(value: unknown, siteId: string): ISiteAddresses {
  const result = object(value);
  const addresses = object(result.addresses);

  if (result.siteId !== siteId) {
    throw new Error('Foreign settings');
  }

  const parsed = { publicOrigin: nullable(addresses.publicOrigin), localOrigin: nullable(addresses.localOrigin) };

  for (const value of Object.values(parsed)) {
    if (value === null) {
      continue;
    }

    const origin = new URL(value);

    if (
      !['http:', 'https:'].includes(origin.protocol)
      || origin.origin !== value
      || origin.username
      || origin.password
    ) {
      throw new Error('Invalid origin');
    }
  }

  const mode = addresses.originMode;

  if (mode !== undefined && mode !== SiteOriginMode.Local && mode !== SiteOriginMode.Public) {
    throw new Error('Invalid serving origin choice');
  }

  return { ...parsed, ...(mode === undefined ? {} : { originMode: mode }) };
}

export async function getSiteAddresses(siteId: string): Promise<ISiteAddresses> {
  return readAddresses(await request('/' + siteId + '/settings'), siteId);
}

export async function saveSiteAddresses(siteId: string, addresses: ISiteAddresses,
  expectedAddresses: ISiteAddresses): Promise<ISiteAddresses> {
  return readAddresses(await request('/' + siteId + '/settings', { addresses, expectedAddresses }), siteId);
}

export async function getSiteTimeZone(siteId: string): Promise<string> {
  return string(object(await request('/' + siteId + '/settings')).timeZone);
}

export async function saveSiteTimeZone(siteId: string, timeZone: string, expectedTimeZone: string): Promise<string> {
  return string(object(await request('/' + siteId + '/settings', { timeZone, expectedTimeZone })).timeZone);
}
