import type { Site } from '../../../domain/sites/site.js';
import type { ISiteAddresses } from '../../../domain/sites/site-addresses.js';
import type { ITransliterationRule } from '../../../domain/sites/transliteration.policy.js';

export interface ISiteTransliterationUpdate {
  readonly language: string;
  readonly rules: readonly ITransliterationRule[];
  readonly expectedRules: readonly ITransliterationRule[];
  readonly collapseHyphens: boolean;
  readonly expectedCollapseHyphens: boolean;
}

export interface IUpdateSiteInput {
  timeZone?: string;
  expectedTimeZone?: string;
  addresses?: ISiteAddresses;
  expectedAddresses?: ISiteAddresses;
  transliteration?: ISiteTransliterationUpdate;
  siteId: string;
  name?: string;
  primaryDomain?: string;
  addLanguages?: string[];
  removeLanguages?: string[];
  defaultLanguage?: string;
}

export interface IUpdateSite {
  execute(input: IUpdateSiteInput): Promise<Site>;
}
