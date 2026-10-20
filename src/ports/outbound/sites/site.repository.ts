import type { Site } from '../../../domain/sites/site.js';

export interface ISiteRepository {
  findById(siteId: string): Promise<Site | null>;
  findByMark(mark: string): Promise<Site | null>;
  findByPrimaryDomain(primaryDomain: string): Promise<Site | null>;
  findAll(): Promise<Site[]>;
  save(site: Site): Promise<Site>;
}
