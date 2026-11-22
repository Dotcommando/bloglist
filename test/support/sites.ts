import { Site } from '../../src/domain/sites/site.js';
import { servingSiteAuthority } from '../../src/domain/sites/site-addresses.js';
import { SiteStatus } from '../../src/domain/sites/site-status.enum.js';
import type { ICreateSiteInput } from '../../src/ports/inbound/sites/create-site.port.js';
import type { ISiteRepository } from '../../src/ports/outbound/sites/site.repository.js';

export const instant = new Date('2026-10-24T10:00:00.000Z');

export function siteInput(): ICreateSiteInput {
  return {
    mark: 'Example',
    name: ' Example ',
    primaryDomain: 'EXAMPLE.TEST',
    languages: ['EN', 'ru'],
    defaultLanguage: 'EN',
  };
}

export function siteFixture(siteId = 'site-1', mark = 'Example', primaryDomain = 'example.test'): Site {
  return new Site({
    ...siteInput(),
    siteId,
    mark,
    primaryDomain,
    status: SiteStatus.ACTIVE,
    createdAt: instant,
    updatedAt: instant,
  });
}

export class FakeSiteRepository implements ISiteRepository {
  readonly records = new Map<string, Site>();

  async findById(siteId: string): Promise<Site | null> {
    const site = this.records.get(siteId);

    return site ? new Site(site.toState()) : null;
  }

  async findByMark(mark: string): Promise<Site | null> {
    return this.find((site) => site.mark.toLowerCase() === mark.toLowerCase());
  }

  async findByPrimaryDomain(hostname: string): Promise<Site | null> {
    return this.find((site) => site.primaryDomain === hostname);
  }

  async findByServingAuthority(authority: string): Promise<Site | null> {
    return this.find((site) => servingSiteAuthority(site.toState().addresses) === authority);
  }

  async findAll(): Promise<Site[]> {
    return [...this.records.values()].map((site) => new Site(site.toState()));
  }

  async save(site: Site): Promise<Site> {
    this.records.set(site.siteId, new Site(site.toState()));

    return new Site(site.toState());
  }

  private find(predicate: (site: Site) => boolean): Site | null {
    const site = [...this.records.values()].find(predicate);

    return site ? new Site(site.toState()) : null;
  }
}
