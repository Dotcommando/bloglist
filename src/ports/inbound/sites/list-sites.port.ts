import type { Site } from '../../../domain/sites/site.js';

export interface IListSites {
  execute(): Promise<Site[]>;
}
