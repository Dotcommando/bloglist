import { OpenGraphType } from '../../../../domain/pages/open-graph-type.enum.js';
import { parseRequestCachePolicy } from '../../../../domain/publication/request-cache.policy.js';
import { SiteOriginMode } from '../../../../domain/sites/site-origin-mode.enum.js';
import type { ICreatePageInput } from '../../../../ports/inbound/pages/create-page.port.js';
import type { IMovePageInput } from '../../../../ports/inbound/pages/move-page.port.js';
import type { IUpdatePageInput } from '../../../../ports/inbound/pages/update-page.port.js';
import type { ICreateSiteInput } from '../../../../ports/inbound/sites/create-site.port.js';
import { HttpFailure, readAccessGroupId } from '../shared/admin-http.boundary.js';

function allowed(body: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(body).some((key) => !keys.includes(key))) {
    throw new HttpFailure(400, 'Unknown fields');
  }
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  if (typeof value !== 'string') {
    throw new HttpFailure(400, 'String field required: ' + key);
  }

  return value;
}

function parent(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];

  if (value !== null && (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value))) {
    throw new HttpFailure(400, 'Invalid parent page identity');
  }

  return value;
}

function order(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpFailure(400, 'Invalid page order');
  }

  return value;
}

export function parsePageMove(body: Record<string, unknown>, siteId: string, pageId: string): IMovePageInput {
  allowed(body, ['parentPageId', 'expectedParentPageId', 'expectedSortOrder']);

  return {
    siteId,
    pageId,
    parentPageId: parent(body, 'parentPageId'),
    expectedParentPageId: parent(body, 'expectedParentPageId'),
    expectedSortOrder: order(body.expectedSortOrder),
  };
}

function documentFields(body: Record<string, unknown>): Pick<IUpdatePageInput, 'mimeType' | 'excludeFromSitemap'> {
  if (body.excludeFromSitemap !== undefined && typeof body.excludeFromSitemap !== 'boolean') {
    throw new HttpFailure(400, 'excludeFromSitemap must be a boolean');
  }

  return {
    ...(body.mimeType === undefined ? {} : { mimeType: text(body, 'mimeType') }),
    ...(body.excludeFromSitemap === undefined ? {} : { excludeFromSitemap: body.excludeFromSitemap }),
  };
}

const metadataFields = ['h1', 'metaTitle', 'metaDescription', 'ogTitle', 'ogDescription', 'ogImage', 'ogType'] as const;

function metadata(body: Record<string, unknown>):
Pick<IUpdatePageInput, typeof metadataFields[number] | 'robotsIndex'> {
  const result: Pick<IUpdatePageInput, typeof metadataFields[number] | 'robotsIndex'> = {};

  for (const field of metadataFields) {
    const value = body[field];

    if (value === undefined) {
      continue;
    }
    if (value !== null && typeof value !== 'string') {
      throw new HttpFailure(400, 'Metadata must be a string or null');
    }
    if (field === 'ogType') {
      if (value !== null && value !== OpenGraphType.Website && value !== OpenGraphType.Article) {
        throw new HttpFailure(400, 'Invalid Open Graph type');
      }
      result.ogType = value;
    } else {
      result[field] = value;
    }
  }

  if (body.robotsIndex !== undefined) {
    if (typeof body.robotsIndex !== 'boolean') {
      throw new HttpFailure(400, 'robotsIndex must be a boolean');
    }
    result.robotsIndex = body.robotsIndex;
  }

  return result;
}

export function parseSiteCreation(body: Record<string, unknown>): ICreateSiteInput {
  allowed(body, ['mark', 'name', 'primaryDomain', 'languages', 'defaultLanguage', 'onboarding']);
  const languages = body.languages;

  if (!Array.isArray(languages) || !languages.every((item: unknown) => typeof item === 'string')) {
    throw new HttpFailure(400, 'Languages must be strings');
  }

  return {
    ...(body.onboarding === undefined ? {} : { onboarding: parseOnboarding(body.onboarding) }),
    mark: text(body, 'mark'),
    name: text(body, 'name'),
    primaryDomain: text(body, 'primaryDomain'),
    languages,
    defaultLanguage: text(body, 'defaultLanguage'),
  };
}

function parseOnboarding(value: unknown): NonNullable<ICreateSiteInput['onboarding']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpFailure(400, 'Invalid site onboarding');
  }

  const body = Object.fromEntries(Object.entries(value));

  allowed(body, ['localAddress', 'originMode']);

  if (body.originMode !== SiteOriginMode.Local && body.originMode !== SiteOriginMode.Public) {
    throw new HttpFailure(400, 'Choose the current site origin');
  }

  return { localAddress: text(body, 'localAddress'), originMode: body.originMode };
}

export function parsePageCreation(body: Record<string, unknown>, siteId: string): ICreatePageInput {
  allowed(body, ['mark', 'language', 'title', 'contentMd', ...metadataFields,
    'robotsIndex', 'parentPageId', 'sortOrder', 'mimeType', 'excludeFromSitemap', 'accessGroupId']);
  const accessGroupId = readAccessGroupId(body.accessGroupId);

  return {
    siteId,
    ...(accessGroupId === undefined ? {} : { accessGroupId }),
    mark: text(body, 'mark'),
    language: text(body, 'language'),
    title: text(body, 'title'),
    contentMd: text(body, 'contentMd'),
    ...metadata(body),
    ...documentFields(body),
    ...(body.parentPageId === undefined ? {} : { parentPageId: parent(body, 'parentPageId') }),
    ...(body.sortOrder === undefined ? {} : { sortOrder: order(body.sortOrder) }),
  };
}

export function parsePageUpdate(body: Record<string, unknown>, siteId: string, pageId: string): IUpdatePageInput {
  allowed(body, ['title', 'contentMd', ...metadataFields,
    'robotsIndex', 'sortOrder', 'mimeType', 'excludeFromSitemap', 'requestCache']);

  return {
    siteId,
    pageId,
    ...(body.requestCache === undefined ? {} : {
      requestCache: body.requestCache === null ? null : parseRequestCachePolicy(body.requestCache),
    }),
    title: text(body, 'title'),
    contentMd: text(body, 'contentMd'),
    ...metadata(body),
    ...documentFields(body),
    ...(body.sortOrder === undefined ? {} : { sortOrder: order(body.sortOrder) }),
  };
}
