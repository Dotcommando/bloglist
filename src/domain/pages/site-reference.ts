import type { ITransliterationOverride } from '../sites/transliteration.policy.js';

export interface ISiteReference {
  siteId: string;
  languages: readonly string[];
  transliteration?: readonly ITransliterationOverride[];
  collapseTransliterationHyphens?: boolean;
}
