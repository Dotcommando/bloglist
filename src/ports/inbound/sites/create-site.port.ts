import type { Site } from '../../../domain/sites/site.js';
import type { SiteOriginMode } from '../../../domain/sites/site-origin-mode.enum.js';

export interface ICreateSiteInput {
  onboarding?: { localAddress: string; originMode: SiteOriginMode };
  mark: string;
  name: string;
  primaryDomain: string;
  languages: string[];
  defaultLanguage: string;
}

export interface ICreateSite {
  execute(input: ICreateSiteInput): Promise<Site>;
}
