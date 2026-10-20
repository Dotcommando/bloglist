import type { Site } from '../../../domain/sites/site.js';

export interface IGetSiteInput {
  siteId: string;
}

export interface IGetSite {
  execute(input: IGetSiteInput): Promise<Site | null>;
}
