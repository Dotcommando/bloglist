import type { Site } from '../../../domain/sites/site.js';

export interface ICreateSiteInput {
  mark: string;
  name: string;
  primaryDomain: string;
  languages: string[];
  defaultLanguage: string;
}

export interface ICreateSite {
  execute(input: ICreateSiteInput): Promise<Site>;
}
