import { SitemapReason, SystemDocument } from '../../features/pages/crawler.types.js';
import { readRequestCachePolicy } from '../../features/pages/request-cache.js';
import { type ITemplateDiagnostic, readTemplateDiagnostic } from '../../features/rendering/rendering.types.js';
import { parseTvValues } from '../../features/template-variables/template-variables.types.js';
import type {
  IAdminPage, IAdminSite, IPageCreation, IPageEditorialStates, IPublicationOptions, ISiteCreation,
} from './content.types.js';
import { OpenGraphType } from './content.types.js';

export class ContentRequestError extends Error {
  constructor(readonly status: number, readonly code: string, readonly diagnostic: ITemplateDiagnostic | null = null,
    readonly field: string | null = null, readonly jsonLdIssue: string | null = null) {
    super('Content request failed');
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid server response');
  }

  return Object.fromEntries(Object.entries(value));
}

export function string(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid server response');
  }

  return value;
}

function site(value: unknown): IAdminSite {
  const row = object(value);

  if (!Array.isArray(row.languages)) {
    throw new Error('Invalid languages');
  }

  return {
    siteId: string(row.siteId),
    mark: string(row.mark),
    name: string(row.name),
    primaryDomain: string(row.primaryDomain),
    languages: row.languages.map(string),
    defaultLanguage: string(row.defaultLanguage),
    status: string(row.status),
  };
}

function page(value: unknown): IAdminPage {
  const row = object(value);

  if (
    row.robotsIndex !== undefined
    && typeof row.robotsIndex !== 'boolean'
    || row.ogType != null
    && row.ogType !== OpenGraphType.Website
    && row.ogType !== OpenGraphType.Article
  ) {
    throw new Error('Invalid page metadata');
  }

  return {
    ...(row.rendering == null ? {} : { rendering: readRendering(row.rendering) }),
    mimeType: row.mimeType === undefined ? 'text/html' : string(row.mimeType),
    excludeFromSitemap: row.excludeFromSitemap === true,
    systemDocument: row.systemDocument == null ? null : readSystemDocument(row.systemDocument),
    pageId: string(row.pageId),
    ...(row.tvValues === undefined ? {} : { tvValues: parseTvValues(row.tvValues) }),
    ...(row.authoredTvValues === undefined ? {} : { authoredTvValues: parseTvValues(row.authoredTvValues) }),
    ...(row.updatedAt === undefined ? {} : { updatedAt: string(row.updatedAt) }),
    pageNumber: row.pageNumber == null ? null : string(row.pageNumber),
    parentPageId: row.parentPageId == null ? null : string(row.parentPageId),
    sortOrder: typeof row.sortOrder === 'number' && Number.isSafeInteger(row.sortOrder) ? row.sortOrder : 100,
    siteId: string(row.siteId),
    mark: string(row.mark),
    title: string(row.title),
    language: string(row.language),
    status: string(row.status),
    contentMd: row.contentMd === undefined ? '' : string(row.contentMd),
    h1: row.h1 == null ? null : string(row.h1),
    metaTitle: row.metaTitle == null ? null : string(row.metaTitle),
    metaDescription: row.metaDescription == null ? null : string(row.metaDescription),
    robotsIndex: row.robotsIndex ?? true,
    ogTitle: row.ogTitle == null ? null : string(row.ogTitle),
    ogDescription: row.ogDescription == null ? null : string(row.ogDescription),
    ogImage: row.ogImage == null ? null : string(row.ogImage),
    ogType: row.ogType ?? null,
  };
}

function readSystemDocument(value: unknown): SystemDocument {
  const result = Object.values(SystemDocument).find((role) => role === value);

  if (!result) {
    throw new Error('Invalid system document role');
  }

  return result;
}

function items<T>(value: unknown, parse: (item: unknown) => T): T[] {
  const row = object(value);

  if (!Array.isArray(row.items)) {
    throw new Error('Invalid list');
  }

  return row.items.map(parse);
}

export async function request(route: string, body?: unknown, timeoutMs = 15000,
  idempotencyKey?: string, file?: File): Promise<unknown> {
  const response = await fetch('/api/admin/sites' + route, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'X-Zarya-Admin': '1',
      ...(body === undefined ? {} : { 'Content-Type': file ? 'application/octet-stream' : 'application/json' }),
      ...(file ? { 'X-Zarya-File-Metadata': encodeURIComponent(JSON.stringify(body)) } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: file ?? JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const value: unknown = await response.json().catch(() => null);
    const data = value && typeof value === 'object' && 'error' in value ? value.error : null;
    const diagnostic = response.status === 400 && data === 'Validation' && value && typeof value === 'object'
      && 'diagnostic' in value ? readTemplateDiagnostic(value.diagnostic) : null;
    const field = value && typeof value === 'object' && 'field' in value && typeof value.field === 'string'
      ? value.field : null;

    throw new ContentRequestError(response.status, typeof data === 'string' ? data : 'InternalError',
      diagnostic, field, value && typeof value === 'object' && 'jsonLdIssue' in value
        && typeof value.jsonLdIssue === 'string' ? value.jsonLdIssue : null);
  }

  return response.json();
}

export async function listSites(): Promise<IAdminSite[]> {
  return items(await request(''), site);
}

export async function createSite(input: ISiteCreation): Promise<IAdminSite> {
  return site(await request('', input));
}

export async function listPages(siteId: string): Promise<IAdminPage[]> {
  return items(await request('/' + encodeURIComponent(siteId) + '/pages'), page);
}

export async function getPageJsonLd(siteId: string, pageId: string, published: boolean): Promise<string> {
  const result = object(await request('/' + encodeURIComponent(siteId) + '/pages/' + encodeURIComponent(pageId)
    + (published ? '/json-ld-published' : '/json-ld-preview'), undefined, 120000));

  return result.jsonLd === null ? '{}' : string(result.jsonLd)
    + (Array.isArray(result.warnings) && result.warnings.length
      ? '\n\nWarnings: ' + JSON.stringify(result.warnings) : '');
}

export async function getPageMarkdown(siteId: string, pageId: string, published: boolean): Promise<string> {
  const result = object(await request('/' + encodeURIComponent(siteId) + '/pages/' + encodeURIComponent(pageId)
    + (published ? '/markdown-published' : '/markdown-preview'), undefined, 120000));

  return string(result.markdown);
}

export async function getPage(siteId: string, pageId: string): Promise<IAdminPage> {
  return page(await request('/' + encodeURIComponent(siteId) + '/pages/' + encodeURIComponent(pageId)));
}

export async function savePage(siteId: string, existing: IAdminPage | null, input: IPageCreation):
Promise<IAdminPage | null> {
  const saved = await request('/' + encodeURIComponent(siteId) + '/pages'
    + (existing ? '/' + encodeURIComponent(existing.pageId) : ''),
  existing ? {
    title: input.title,
    contentMd: input.contentMd,
    mimeType: input.mimeType,
    excludeFromSitemap: input.excludeFromSitemap,
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
    ...(input.requestCache === undefined ? {} : { requestCache: input.requestCache }),
    h1: input.h1,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    robotsIndex: input.robotsIndex,
    ogTitle: input.ogTitle,
    ogDescription: input.ogDescription,
    ogImage: input.ogImage,
    ogType: input.ogType,
  } : input);

  return existing && object(saved).saved === true ? null : page(saved);
}

export async function movePage(siteId: string, source: IAdminPage, parentPageId: string | null): Promise<IAdminPage> {
  const saved = page(await request('/' + encodeURIComponent(siteId) + '/pages/'
    + encodeURIComponent(source.pageId) + '/position', {
    parentPageId,
    expectedParentPageId: source.parentPageId,
    expectedSortOrder: source.sortOrder,
  }));

  if (
    saved.siteId !== siteId
    || saved.pageId !== source.pageId
    || saved.pageNumber !== source.pageNumber
    || saved.sortOrder !== source.sortOrder
    || saved.parentPageId !== parentPageId
  ) {
    throw new Error('Inconsistent moved page');
  }

  return saved;
}

function readRendering(value: unknown): NonNullable<IAdminPage['rendering']> {
  const row = object(value);

  return {
    templateId: string(row.templateId),
    delivery: string(row.delivery),
    interaction: string(row.interaction),
    parameters: row.parameters,
    loaders: row.loaders,
    requestCache: row.requestCache == null ? null : readRequestCachePolicy(row.requestCache),
  };
}

function readEditorial(value: unknown): IPageEditorialStates {
  const row = object(value);

  if (!Array.isArray(row.pages) || typeof row.robotsHasUnpublishedChanges !== 'boolean') {
    throw new Error('Invalid editorial state');
  }

  const raw = row.publishedPage == null ? null : object(row.publishedPage);
  const rendering = raw?.rendering == null ? null : object(raw.rendering);

  return {
    releaseId: row.releaseId == null ? null : string(row.releaseId),
    pages: row.pages.map((value: unknown) => {
      const item = object(value);

      if (typeof item.hasPublishedVersion !== 'boolean' || !Array.isArray(item.changedFields)) {
        throw new Error('Invalid page editorial state');
      }

      return {
        pageId: string(item.pageId),
        hasPublishedVersion: item.hasPublishedVersion,
        changedFields: item.changedFields.map(string),
      };
    }),
    publishedPage: raw === null ? null : {
      ...page(raw),
      ...(rendering ? {
        rendering: {
          templateId: string(rendering.templateId),
          delivery: string(rendering.delivery),
          interaction: string(rendering.interaction),
          parameters: rendering.parameters,
          loaders: rendering.loaders,
          requestCache: rendering.requestCache == null ? null : readRequestCachePolicy(rendering.requestCache),
        },
      } : {}),
    },
    robotsHasUnpublishedChanges: row.robotsHasUnpublishedChanges,
  };
}

export async function getPublicationOptions(siteId: string, pageId?: string): Promise<IPublicationOptions> {
  const result = object(await request('/' + encodeURIComponent(siteId)
    + (pageId ? '/pages/' + encodeURIComponent(pageId) : '') + '/publication'));

  if (!Array.isArray(result.templates) || !Array.isArray(result.pageAvailability)) {
    throw new Error('Invalid template options');
  }

  return {
    ...(result.editorial === undefined ? {} : { editorial: readEditorial(result.editorial) }),
    mimeTypes: Array.isArray(result.mimeTypes) ? result.mimeTypes.map(string) : ['text/html'],
    generatedContent: result.generatedContent == null ? null : string(result.generatedContent),
    crawlerDiagnostics: Array.isArray(result.crawlerDiagnostics) ? result.crawlerDiagnostics.map((value: unknown) => {
      const item = object(value);

      if (
        typeof item.inSitemap !== 'boolean'
        || typeof item.robotsAvailable !== 'boolean'
        || !Array.isArray(item.blockedBy)
      ) {
        throw new Error('Invalid crawler diagnostics');
      }

      const reason = item.reason == null ? null : Object.values(SitemapReason).find((reason) => reason === item.reason);

      if (reason === undefined) {
        throw new Error('Invalid sitemap reason');
      }

      return {
        pageId: string(item.pageId),
        path: string(item.path),
        inSitemap: item.inSitemap,
        reason,
        robotsAvailable: item.robotsAvailable,
        blockedBy: item.blockedBy.map((value: unknown) => {
          const rule = object(value);

          if (typeof rule.line !== 'number') {
            throw new Error('Invalid robots line');
          }

          return { agent: string(rule.agent), rule: string(rule.rule), line: rule.line };
        }),
      };
    }) : [],
    pageAvailability: result.pageAvailability.map((value: unknown) => {
      const item = object(value);

      return {
        pageId: string(item.pageId),
        assignedPath: item.assignedPath === null ? null : string(item.assignedPath),
        publicPath: item.publicPath === null ? null : string(item.publicPath),
      };
    }),
    templates: result.templates.map((value: unknown) => {
      const item = object(value);

      if (typeof item.requiresParameters !== 'boolean') {
        throw new Error('Invalid template descriptor');
      }

      return {
        templateId: string(item.templateId),
        name: string(item.name ?? item.templateId),
        requiresParameters: item.requiresParameters,
      };
    }),
    requestDelivery: result.requestDelivery === true,
    requestCache: result.requestCache == null ? null : readRequestCachePolicy(result.requestCache),
    templateId: result.templateId === null ? null : string(result.templateId),
    path: result.path === null ? null : string(result.path),
  };
}

export async function publishPage(siteId: string, pageId: string, templateId: string,
  path?: string): Promise<IAdminPage> {
  const result = object(await request('/' + encodeURIComponent(siteId) + '/pages/'
    + encodeURIComponent(pageId) + '/publication', {
    ...(templateId ? { templateId } : {}), ...(path === undefined ? {} : { path }),
  }, 120000));
  const saved = page(result.page);

  if (saved.siteId !== siteId || saved.pageId !== pageId || saved.status !== 'PUBLISHED') {
    throw new Error('Invalid publication result');
  }

  return saved;
}

export async function publishSite(siteId: string): Promise<void> {
  const result = object(await request('/' + encodeURIComponent(siteId) + '/publish', {}, 120000));

  if (string(result.siteId) !== siteId || !string(result.releaseId)) {
    throw new Error('Invalid site publication result');
  }
}

export enum ContentErrorMessage {
  AutomaticPageUrlHeading = 'pageAutomaticUrlHeadingError',
  AutomaticPageUrlParent = 'pageAutomaticUrlParentError',
  Conflict = 'contentConflict',
  Invalid = 'contentInvalid',
  Missing = 'contentMissing',
  Forbidden = 'contentForbidden',
  TooLarge = 'contentTooLarge',
  Failed = 'contentFailed',
}

export function contentError(error: unknown): ContentErrorMessage {
  if (error instanceof ContentRequestError) {
    if (error.code === 'AutomaticPageUrlHeading') {
      return ContentErrorMessage.AutomaticPageUrlHeading;
    }
    if (error.code === 'AutomaticPageUrlParent') {
      return ContentErrorMessage.AutomaticPageUrlParent;
    }
    if (error.status === 409) {
      return ContentErrorMessage.Conflict;
    }
    if (error.status === 400) {
      return ContentErrorMessage.Invalid;
    }
    if (error.status === 404) {
      return ContentErrorMessage.Missing;
    }
    if (error.status === 403) {
      return ContentErrorMessage.Forbidden;
    }
    if (error.status === 413) {
      return ContentErrorMessage.TooLarge;
    }
  }

  return ContentErrorMessage.Failed;
}
