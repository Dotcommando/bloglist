import type { IPageState } from '../pages/page.js';
import type { ITemplateObject } from '../pages/page-rendering.js';
import { PageStatus } from '../pages/page-status.enum.js';
import { isPageNumber } from '../pages/page-tree.policy.js';
import type { IUrlState } from '../routing/url.js';
import { UrlKind } from '../routing/url-kind.enum.js';
import { requireUrlPath } from '../routing/url-path.policy.js';
import { requireCondition } from '../shared/validation.js';

export interface IPublishedPageSummary {
  readonly tvValues?: ITemplateObject;
  readonly tv?: ITemplateObject;
  readonly pageNumber?: string | null;
  readonly siteId: string;
  readonly pageId: string;
  readonly urlId: string;
  readonly parentUrlId: string | null;
  readonly title: string;
  readonly language: string;
  readonly path: string;
}

export function validatePublishedPages(siteId: string, pages: readonly IPublishedPageSummary[]): void {
  requireCondition(new Set(pages.map((page) => page.urlId)).size === pages.length,
    'Duplicate published page address');

  for (const page of pages) {
    requireCondition(page.pageNumber == null || isPageNumber(page.pageNumber), 'Invalid numeric page reference');
    requireCondition(Boolean(page.siteId === siteId && page.pageId.trim() && page.urlId.trim()
      && typeof page.title === 'string' && page.language.trim()
      && (page.parentUrlId === null || Boolean(page.parentUrlId.trim()))), 'Invalid published page summary');
    requireUrlPath(page.path);
    requireCondition(!/^\/(?:(?:api|admin|assets)(?:\/|$)|favicon\.ico$)/.test(page.path), 'Reserved published page address');
  }
}

export function summarizePublishedPages(siteId: string, pages: readonly IPageState[],
  urls: readonly IUrlState[], templateValues?: Readonly<Record<string,
    ITemplateObject>>): readonly IPublishedPageSummary[] {
  requireCondition(pages.every((page) => page.siteId === siteId)
    && urls.every((url) => url.siteId === siteId), 'Foreign publication catalog source');
  const summaries = urls.flatMap((url) => {
    const page = pages.find((page) => page.pageId === url.pageId && page.status === PageStatus.PUBLISHED);

    return url.kind === UrlKind.PAGE && page && !page.systemDocument ? [{
      siteId,
      pageId: page.pageId,
      pageNumber: page.pageNumber ?? null,
      urlId: url.urlId,
      parentUrlId: url.parentUrlId,
      title: page.title,
      language: page.language,
      path: url.path,
      ...(page.tvValues === undefined ? {} : { tvValues: page.tvValues }),
      ...(templateValues?.[page.pageId] === undefined ? {} : { tv: templateValues[page.pageId] }),
    }] : [];
  });

  validatePublishedPages(siteId, summaries);

  return summaries;
}
