import type { IClusterState } from '../src/domain/clusters/cluster.js';
import type { IClusterBlogPlacementState } from '../src/domain/clusters/cluster-blog-placement.js';
import { ClusterStatus } from '../src/domain/clusters/cluster-status.enum.js';
import type { IBlogState } from '../src/domain/creators/blog.js';
import { BlogPlatform } from '../src/domain/creators/blog-platform.enum.js';
import { BlogStatus } from '../src/domain/creators/blog-status.enum.js';
import type { IBloggerState } from '../src/domain/creators/blogger.js';
import { BloggerStatus } from '../src/domain/creators/blogger-status.enum.js';
import { BloggerType } from '../src/domain/creators/blogger-type.enum.js';
import type { IPageState } from '../src/domain/pages/page.js';
import { PageStatus } from '../src/domain/pages/page-status.enum.js';
import { PageType } from '../src/domain/pages/page-type.enum.js';
import type { IUrlState } from '../src/domain/routing/url.js';
import { UrlKind } from '../src/domain/routing/url-kind.enum.js';
import type { ISiteState } from '../src/domain/sites/site.js';
import { SiteStatus } from '../src/domain/sites/site-status.enum.js';

export function instant(): Date {
  return new Date('2026-01-15T12:00:00.000Z');
}

export function siteState(overrides: Partial<ISiteState> = {}): ISiteState {
  return {
    siteId: 'site-1',
    mark: 'Wood',
    name: 'Wood',
    primaryDomain: 'example.com',
    languages: ['en', 'de'],
    defaultLanguage: 'en',
    status: SiteStatus.ACTIVE,
    createdAt: instant(),
    updatedAt: instant(),
    ...overrides,
  };
}

export function clusterState(overrides: Partial<IClusterState> = {}): IClusterState {
  return {
    clusterId: 'cluster-1',
    mark: 'WoodCluster',
    siteId: 'site-1',
    parentClusterId: null,
    language: 'en',
    name: 'Wood',
    descriptionMd: null,
    industry: null,
    geography: null,
    primaryQuery: null,
    status: ClusterStatus.ACTIVE,
    createdAt: instant(),
    updatedAt: instant(),
    ...overrides,
  };
}

export function placementState(overrides: Partial<IClusterBlogPlacementState> = {}): IClusterBlogPlacementState {
  return {
    clusterBlogPlacementId: 'placement-1',
    clusterId: 'cluster-1',
    blogId: 'blog-1',
    position: 125.5,
    notesMd: null,
    visible: true,
    createdAt: instant(),
    updatedAt: instant(),
    ...overrides,
  };
}

export function pageState(overrides: Partial<IPageState> = {}): IPageState {
  return {
    pageId: 'page-1',
    mark: 'WoodPage',
    siteId: 'site-1',
    clusterId: null,
    language: 'en',
    type: PageType.STATIC,
    status: PageStatus.DRAFT,
    title: 'Wood',
    h1: null,
    metaTitle: null,
    metaDescription: null,
    contentMd: '',
    robotsIndex: true,
    publishedAt: null,
    createdAt: instant(),
    updatedAt: instant(),
    ...overrides,
  };
}

export function urlState(overrides: Partial<IUrlState> = {}): IUrlState {
  return {
    urlId: 'url-1',
    mark: 'WoodUrl',
    siteId: 'site-1',
    parentUrlId: null,
    segment: 'wood',
    path: '/wood/',
    kind: UrlKind.PAGE,
    pageId: 'page-1',
    redirectTargetUrlId: null,
    redirectStatus: null,
    firstPublishedAt: instant(),
    createdAt: instant(),
    updatedAt: instant(),
    ...overrides,
  };
}

export function bloggerState(overrides: Partial<IBloggerState> = {}): IBloggerState {
  return {
    bloggerId: 'blogger-1',
    mark: 'John',
    name: 'John',
    type: BloggerType.PERSON,
    country: null,
    website: null,
    contactEmail: null,
    notesMd: null,
    status: BloggerStatus.ACTIVE,
    createdAt: instant(),
    updatedAt: instant(),
    ...overrides,
  };
}

export function blogState(overrides: Partial<IBlogState> = {}): IBlogState {
  return {
    blogId: 'blog-1',
    mark: 'JohnChannel',
    bloggerId: 'blogger-1',
    platform: BlogPlatform.YOUTUBE,
    name: 'John channel',
    url: 'https://example.com/',
    externalId: null,
    handle: null,
    followers: null,
    description: null,
    lastCheckedAt: null,
    status: BlogStatus.ACTIVE,
    createdAt: instant(),
    updatedAt: instant(),
    ...overrides,
  };
}
