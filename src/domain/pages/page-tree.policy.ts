import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import type { SystemDocument } from './document-mime.js';

export const maximumPageNumber = 9223372036854775807n;

export interface IPagePosition {
  readonly systemDocument?: SystemDocument | null;
  readonly pageId: string;
  readonly siteId: string;
  readonly parentPageId?: string | null;
  readonly sortOrder?: number | null;
  readonly pageNumber?: string | null;
}

export function isPageNumber(value: string): boolean {
  return /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= maximumPageNumber;
}

export function validateSortOrder(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Page order must be a nonnegative safe integer');
  }
}

export function nextPageOrder(pages: readonly IPagePosition[], parentPageId: string | null): number {
  const value = pages.filter((page) => (page.parentPageId ?? null) === parentPageId)
    .reduce((maximum, page) => Math.max(maximum, page.sortOrder ?? 100), 0) + 100;

  validateSortOrder(value);

  return value;
}

export function assertPageParent(siteId: string, pageId: string, parentPageId: string | null,
  pages: readonly IPagePosition[]): void {
  const visited = new Set<string>([pageId]);
  let current = parentPageId;

  while (current !== null) {
    if (visited.has(current)) {
      throw new BusinessError(BusinessErrorCode.Validation, 'A page cannot contain itself or an ancestor');
    }
    visited.add(current);
    const page = pages.find((page) => page.siteId === siteId && page.pageId === current);

    if (!page) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Parent page not found');
    }
    if (page.systemDocument) {
      throw new BusinessError(BusinessErrorCode.Validation, 'System documents cannot contain child pages');
    }
    current = page.parentPageId ?? null;
  }
}
