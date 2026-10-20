import type { Site } from '../../../domain/sites/site.js';

export interface IArchiveSiteInput {
  siteId: string;
}

export interface IArchiveSite {
  execute(input: IArchiveSiteInput): Promise<Site>;
}
