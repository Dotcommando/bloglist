import type { IUrlSuggestion, UrlSearchPurpose } from '../../../domain/routing/url-search.js';

export interface ISearchUrlsInput {
  readonly siteId: string;
  readonly currentUrlId: string;
  readonly purpose: UrlSearchPurpose;
  readonly query: string;
  readonly limit: number;
  readonly offset: number;
}

export interface IUrlSuggestions {
  readonly siteId: string;
  readonly items: readonly IUrlSuggestion[];
}

export interface ISearchUrls {
  execute(input: ISearchUrlsInput): Promise<IUrlSuggestions>;
}
