import { Cluster } from '../src/domain/clusters/cluster.js';
import { ClusterBlogPlacement } from '../src/domain/clusters/cluster-blog-placement.js';
import { ClusterStatus } from '../src/domain/clusters/cluster-status.enum.js';
import { Blog } from '../src/domain/creators/blog.js';
import { BlogStatus } from '../src/domain/creators/blog-status.enum.js';
import { Blogger } from '../src/domain/creators/blogger.js';
import { BloggerStatus } from '../src/domain/creators/blogger-status.enum.js';
import { BloggerType } from '../src/domain/creators/blogger-type.enum.js';
import { Page } from '../src/domain/pages/page.js';
import { PageStatus } from '../src/domain/pages/page-status.enum.js';
import { PageType } from '../src/domain/pages/page-type.enum.js';
import { Url } from '../src/domain/routing/url.js';
import { UrlKind } from '../src/domain/routing/url-kind.enum.js';
import { UrlRedirectStatus } from '../src/domain/routing/url-redirect-status.enum.js';
import { Site } from '../src/domain/sites/site.js';
import { SiteStatus } from '../src/domain/sites/site-status.enum.js';
import {
  bloggerState,
  blogState,
  clusterState,
  instant,
  pageState,
  placementState,
  siteState,
  urlState,
} from './domain.fixtures.js';

describe('Site', () => {
  it('normalizes hostnames and language codes and preserves language invariants after failed changes', () => {
    const site = new Site(siteState({ primaryDomain: ' EXAMPLE.COM ', languages: [' EN ', 'DE'] }));

    expect(site.primaryDomain).toBe('example.com');
    expect(site.languages).toEqual(['en', 'de']);
    expect(() => site.addLanguage(' EN ')).toThrow(RangeError);
    expect(() => site.removeLanguage('en')).toThrow(RangeError);
    expect(() => site.changeDefaultLanguage('fr')).toThrow(RangeError);
    expect(site.defaultLanguage).toBe('en');
    expect(site.languages).toEqual(['en', 'de']);
    site.addLanguage(' FR ');
    site.changeDefaultLanguage('fr');
    site.removeLanguage('en');
    expect(site.languages).toEqual(['de', 'fr']);
  });

  it('rejects invalid initial language configurations', () => {
    expect(() => new Site(siteState({ languages: ['en', 'EN'] }))).toThrow(RangeError);
    expect(() => new Site(siteState({ languages: [] }))).toThrow(RangeError);
    expect(() => new Site(siteState({ languages: ['eng'] }))).toThrow(RangeError);
    expect(() => new Site(siteState({ defaultLanguage: 'fr' }))).toThrow(RangeError);
  });

  it('changes site details, supports international hostnames and controls lifecycle', () => {
    const site = new Site(siteState());

    site.changeName(' Workshop ');
    site.changePrimaryDomain('b\u00fccher.example');
    expect(site.primaryDomain).toBe('xn--bcher-kva.example');
    expect(site.name).toBe('Workshop');
    site.archive();
    expect(site.status).toBe(SiteStatus.ARCHIVED);
    site.activate();
    expect(site.status).toBe(SiteStatus.ACTIVE);
  });

  it.each(['https://example.com', 'example.com/path', 'user@example.com', 'example.com:123', 'example.com?x=1'])(
    'rejects a primary domain containing URL components: %s', (primaryDomain) => {
      const site = new Site(siteState());

      expect(() => site.changePrimaryDomain(primaryDomain)).toThrow();
      expect(site.primaryDomain).toBe('example.com');
    },
  );
});

describe('Cluster and ClusterBlogPlacement', () => {
  it('moves clusters without changing site or language and rejects self-parenting', () => {
    const cluster = new Cluster(clusterState());

    cluster.moveTo('cluster-2');
    expect(cluster.parentClusterId).toBe('cluster-2');
    expect(() => cluster.moveTo(cluster.clusterId)).toThrow(RangeError);
    expect(cluster.parentClusterId).toBe('cluster-2');
    cluster.moveTo(null);
    expect(cluster.parentClusterId).toBeNull();
    expect(cluster.siteId).toBe('site-1');
    expect(cluster.language).toBe('en');
    expect(() => new Cluster(clusterState({ parentClusterId: 'cluster-1' }))).toThrow(RangeError);
    expect(() => new Cluster(clusterState({ language: 'eng' }))).toThrow(RangeError);
  });

  it('edits all cluster details and lifecycle', () => {
    const cluster = new Cluster(clusterState());

    cluster.rename(' Workshop ');
    cluster.changeDescription('**Description**');
    cluster.changeIndustry(' wood ');
    cluster.changeGeography(' UK ');
    cluster.changePrimaryQuery(' turners ');
    cluster.archive();
    expect(cluster.toState()).toMatchObject({
      name: 'Workshop',
      descriptionMd: '**Description**',
      industry: 'wood',
      geography: 'UK',
      primaryQuery: 'turners',
      status: ClusterStatus.ARCHIVED,
    });
    cluster.activate();
    expect(cluster.status).toBe(ClusterStatus.ACTIVE);
  });

  it('keeps fractional positions and changes placement visibility and notes independently', () => {
    const placement = new ClusterBlogPlacement(placementState());

    placement.changePosition(175.25);
    placement.changeNotes('**Recommended**');
    placement.hide();
    expect(placement.toState()).toMatchObject({ position: 175.25, notesMd: '**Recommended**', visible: false });
    expect(() => placement.changePosition(Number.NaN)).toThrow(RangeError);
    expect(() => placement.changePosition(Infinity)).toThrow(RangeError);
    expect(placement.position).toBe(175.25);
    placement.show();
    expect(placement.visible).toBe(true);
    expect(placement.clusterId).toBe('cluster-1');
    expect(placement.blogId).toBe('blog-1');
  });
});

describe('Page', () => {
  it('preserves the first UTC publication instant across repeated publication and archiving', () => {
    const page = new Page(pageState());
    const publishedAt = new Date('2026-03-29T03:15:00+03:00');

    page.publish(publishedAt);
    publishedAt.setUTCFullYear(2000);
    expect(page.status).toBe(PageStatus.PUBLISHED);
    expect(page.publishedAt?.toISOString()).toBe('2026-03-29T00:15:00.000Z');
    page.archive();
    expect(page.status).toBe(PageStatus.ARCHIVED);
    page.publish(new Date('2026-04-01T00:00:00Z'));
    expect(page.publishedAt?.toISOString()).toBe('2026-03-29T00:15:00.000Z');
    expect(() => page.publish(new Date('invalid'))).toThrow(RangeError);
  });

  it('edits content, SEO, type, cluster and robots independently of publication', () => {
    const page = new Page(pageState());

    page.changeTitle(' Turners ');
    page.changeHeading('Heading');
    page.changeSeoMetadata({ metaTitle: 'SEO', metaDescription: 'Description' });
    page.changeContent('**Markdown**');
    page.changeType(PageType.MIXED);
    page.assignToCluster('cluster-1');
    page.setRobotsIndex(false);
    expect(page.toState()).toMatchObject({
      title: 'Turners',
      h1: 'Heading',
      metaTitle: 'SEO',
      metaDescription: 'Description',
      contentMd: '**Markdown**',
      type: PageType.MIXED,
      clusterId: 'cluster-1',
      robotsIndex: false,
      status: PageStatus.DRAFT,
      publishedAt: null,
    });
    page.assignToCluster(null);
    expect(page.clusterId).toBeNull();
    expect(() => new Page(pageState({ status: PageStatus.PUBLISHED }))).toThrow(RangeError);
  });
});

describe('Url', () => {
  it.each([UrlRedirectStatus.HTTP_301, UrlRedirectStatus.HTTP_308])(
    'redirects using %s while preserving the permanent public address', (status) => {
      const url = new Url(urlState());
      const before = url.toState();

      url.redirectTo('url-2', status);
      expect(url.toState()).toEqual({
        ...before, kind: UrlKind.REDIRECT, pageId: null, redirectTargetUrlId: 'url-2', redirectStatus: status,
      });
      expect(() => url.redirectTo('url-1', status)).toThrow(RangeError);
      expect(url.redirectTargetUrlId).toBe('url-2');
    },
  );

  it('rejects inconsistent initial states and self-redirects', () => {
    expect(() => new Url(urlState({ pageId: null }))).toThrow(RangeError);
    expect(() => new Url(urlState({ redirectTargetUrlId: 'url-2' }))).toThrow(RangeError);
    expect(() => new Url(urlState({ redirectStatus: UrlRedirectStatus.HTTP_301 }))).toThrow(RangeError);
    expect(() => new Url(urlState({ kind: UrlKind.REDIRECT }))).toThrow(RangeError);
    expect(() => new Url(urlState({
      kind: UrlKind.REDIRECT, pageId: null, redirectTargetUrlId: 'url-1', redirectStatus: UrlRedirectStatus.HTTP_301,
    }))).toThrow(RangeError);
    expect(() => new Url(urlState({ firstPublishedAt: new Date('invalid') }))).toThrow(RangeError);
  });

  it('rehydrates a redirect and rejects external and malformed public paths', () => {
    const url = new Url(urlState({
      kind: UrlKind.REDIRECT, pageId: null, redirectTargetUrlId: 'url-2', redirectStatus: UrlRedirectStatus.HTTP_308,
    }));

    expect(url.kind).toBe(UrlKind.REDIRECT);
    expect(() => new Url(urlState({ path: '//example.com/' }))).toThrow(RangeError);
    expect(() => new Url(urlState({ path: '/wood/?private=1' }))).toThrow(RangeError);
    expect(() => new Url(urlState({ path: 'wood/' }))).toThrow(RangeError);
  });
});

describe('Blogger and Blog', () => {
  it('changes blogger details and lifecycle', () => {
    const blogger = new Blogger(bloggerState());

    blogger.rename(' Team ');
    blogger.changeType(BloggerType.TEAM);
    blogger.changeCountry(' DE ');
    blogger.changeWebsite(' https://example.com ');
    blogger.changeContactEmail(' EDITOR@EXAMPLE.COM ');
    blogger.changeNotes('Internal **notes**');
    blogger.deactivate();
    expect(blogger.toState()).toMatchObject({
      name: 'Team',
      type: BloggerType.TEAM,
      country: 'DE',
      website: 'https://example.com',
      contactEmail: 'editor@example.com',
      notesMd: 'Internal **notes**',
      status: BloggerStatus.INACTIVE,
    });
    blogger.activate();
    expect(blogger.status).toBe(BloggerStatus.ACTIVE);
  });

  it('changes blog details and owner while keeping stable identity separate from handle', () => {
    const blog = new Blog(blogState({ externalId: ' platform-123 ' }));

    blog.rename(' Workshop ');
    blog.changeUrl('https://EXAMPLE.COM/channel');
    blog.changeHandle(' @workshop ');
    blog.changeDescription('Plain description');
    blog.reassignToBlogger('blogger-2');
    blog.deactivate();
    expect(blog.toState()).toMatchObject({
      name: 'Workshop',
      url: 'https://example.com/channel',
      handle: '@workshop',
      externalId: 'platform-123',
      description: 'Plain description',
      bloggerId: 'blogger-2',
      status: BlogStatus.INACTIVE,
    });
    expect(() => blog.reassignToBlogger('')).toThrow(RangeError);
    expect(blog.bloggerId).toBe('blogger-2');
    blog.activate();
    expect(blog.status).toBe(BlogStatus.ACTIVE);
    expect(new Blog(blogState({ externalId: ' ' })).externalId).toBeNull();
  });

  it('updates the latest statistics together and rejects invalid changes without partial writes', () => {
    const blog = new Blog(blogState());
    const checkedAt = instant();

    blog.updateStats(120, checkedAt);
    checkedAt.setUTCFullYear(2000);
    expect(blog.lastCheckedAt).toEqual(instant());

    for (const followers of [-1, Number.NaN, Infinity]) {
      expect(() => blog.updateStats(followers, instant())).toThrow(RangeError);
    }

    expect(() => blog.updateStats(200, new Date('invalid'))).toThrow(RangeError);
    expect(blog.followers).toBe(120);
    expect(blog.lastCheckedAt).toEqual(instant());
    blog.updateStats(0, instant());
    expect(blog.followers).toBe(0);
    expect(() => new Blog(blogState({ followers: -1 }))).toThrow(RangeError);
    expect(() => blog.changeUrl('javascript:alert(1)')).toThrow(RangeError);
  });
});

describe('Entity state ownership', () => {
  it('protects all marks and snapshots from external mutation', () => {
    const entities = [
      new Site(siteState()), new Cluster(clusterState()), new Page(pageState()),
      new Url(urlState()), new Blogger(bloggerState()), new Blog(blogState()),
    ];

    for (const entity of entities) {
      const originalMark = entity.mark;

      expect(Reflect.set(entity, 'mark', 'Changed')).toBe(false);
      expect(entity.mark).toBe(originalMark);
      entity.createdAt.setUTCFullYear(2000);
      entity.toState().updatedAt.setUTCFullYear(2000);
      expect(entity.createdAt).toEqual(instant());
      expect(entity.updatedAt).toEqual(instant());
    }
  });

  it('copies constructor arrays and dates and exposes no setters for immutable URL fields', () => {
    const languages = ['en'];
    const createdAt = instant();
    const site = new Site(siteState({ languages, createdAt }));
    const url = new Url(urlState());

    languages.push('de');
    createdAt.setUTCFullYear(2000);
    expect(site.languages).toEqual(['en']);
    expect(site.createdAt).toEqual(instant());

    for (const field of ['siteId', 'parentUrlId', 'segment', 'path', 'firstPublishedAt']) {
      expect(Reflect.set(url, field, 'changed')).toBe(false);
    }

    url.firstPublishedAt.setUTCFullYear(2000);
    expect(url.firstPublishedAt).toEqual(instant());
  });
});
