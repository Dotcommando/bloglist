import type { UrlKind } from './url-kind.enum.js';

export enum UrlSearchPurpose { Parent = 'Parent', Redirect = 'Redirect' }

export interface IUrlSuggestion {
  readonly siteId: string;
  readonly urlId: string;
  readonly path: string;
  readonly kind: UrlKind;
}

export interface IUrlSearchCriteria {
  readonly siteId: string;
  readonly query: string;
  readonly limit: number;
  readonly offset: number;
  readonly excludeUrlId: string;
  readonly excludePathPrefix?: string;
  readonly pagesOnly: boolean;
}
