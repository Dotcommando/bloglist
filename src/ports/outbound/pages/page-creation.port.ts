import type { IContentCreationAccess } from '../../../domain/authorization/content-access.js';
import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { Page } from '../../../domain/pages/page.js';
import type { Url } from '../../../domain/routing/url.js';
import type { ITransliterationOverride } from '../../../domain/sites/transliteration.policy.js';

export interface IPageSaveAccess extends IContentCreationAccess {
  readonly initialUrl?: { readonly url: Url; readonly hookChange: IHookCommitIntent };
}

export interface IPrepareAutomaticPageUrl {
  prepare(page: Page, overrides: readonly ITransliterationOverride[], collapseHyphens: boolean): Promise<Url>;
}

export interface IPageCreationPort {
  create(page: Page, hookChange?: IHookCommitIntent, access?: IPageSaveAccess): Promise<Page>;
}

export interface IPageSiteGuardPort {
  requireLanguage(siteId: string, language: string): Promise<{
    readonly transliteration?: readonly ITransliterationOverride[];
    readonly collapseTransliterationHyphens?: boolean;
  } | void>;
}
