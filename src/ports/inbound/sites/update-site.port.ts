import type { Site } from '../../../domain/sites/site.js';

export interface IUpdateSiteInput {
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
