import type { IUrlSearchCriteria, IUrlSuggestion } from '../../../domain/routing/url-search.js';

export interface IUrlSearchPort {
  /** Literal case-insensitive path substring; filter before offset/limit. Order by unique site path ascending. */
  search(input: IUrlSearchCriteria): Promise<readonly IUrlSuggestion[]>;
}
