import { Page } from '../../src/domain/pages/page.js';
import type { IPageFilter } from '../../src/domain/pages/page-filter.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { nextPageOrder } from '../../src/domain/pages/page-tree.policy.js';
import { PageType } from '../../src/domain/pages/page-type.enum.js';
import type { ICreatePageInput } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPageRepository } from '../../src/ports/outbound/pages/page.repository.js';
import { instant } from './sites.js';

export function pageInput(): ICreatePageInput {
  return { siteId: 'site-1', mark: 'Home', language: 'EN', title: ' Home ' };
}

export function pageFixture(pageId = 'page-1', siteId = 'site-1', mark = 'Home'): Page {
  return new Page({
    ...pageInput(),
    pageId,
    siteId,
    mark,
    clusterId: null,
    type: PageType.STATIC,
    status: PageStatus.DRAFT,
    h1: null,
    metaTitle: null,
    metaDescription: null,
    contentMd: '',
    robotsIndex: true,
    publishedAt: null,
    createdAt: instant,
    updatedAt: instant,
  });
}

export class FakePageRepository implements IPageRepository {
  readonly records = new Map<string, Page>();

  async findById(pageId: string): Promise<Page | null> {
    const page = this.records.get(pageId);

    return page ? new Page(page.toState()) : null;
  }

  async findByMark(siteId: string, mark: string): Promise<Page | null> {
    const page = [...this.records.values()].find((page) => page.siteId === siteId
      && page.mark.toLowerCase() === mark.toLowerCase());

    return page ? new Page(page.toState()) : null;
  }

  async findBySite(siteId: string, filter: IPageFilter = {}): Promise<Page[]> {
    return [...this.records.values()].filter((page) => page.siteId === siteId
      && (filter.clusterId === undefined || page.clusterId === filter.clusterId)
      && (filter.language === undefined || page.language === filter.language)
      && (filter.status === undefined || page.status === filter.status)
      && (filter.type === undefined || page.type === filter.type)).map((page) => new Page(page.toState()));
  }

  async findByCluster(clusterId: string): Promise<Page[]> {
    return [...this.records.values()].filter((page) => page.clusterId === clusterId)
      .map((page) => new Page(page.toState()));
  }

  async save(page: Page): Promise<Page> {
    let state = page.toState();

    if (!this.records.has(page.pageId) && state.pageNumber === null) {
      const siblings = [...this.records.values()].filter((item) => item.siteId === page.siteId)
        .map((item) => item.toState());
      const maximum = siblings.reduce((maximum, item) => item.pageNumber && BigInt(item.pageNumber) > maximum
        ? BigInt(item.pageNumber) : maximum, 0n);

      state = {
        ...state,
        pageNumber: (maximum + 1n).toString(),
        sortOrder: state.sortOrder ?? nextPageOrder(siblings, state.parentPageId ?? null),
      };
    }
    this.records.set(page.pageId, new Page(state));

    return new Page(state);
  }
}
