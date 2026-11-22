import { Page } from '../src/domain/pages/page.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../src/domain/pages/page-rendering.js';
import { validatePageRendering } from '../src/domain/pages/page-rendering.policy.js';
import { PageStatus } from '../src/domain/pages/page-status.enum.js';
import { PageType } from '../src/domain/pages/page-type.enum.js';
import { Url } from '../src/domain/routing/url.js';
import { UrlKind } from '../src/domain/routing/url-kind.enum.js';
import { UrlRedirectStatus } from '../src/domain/routing/url-redirect-status.enum.js';
import { Site } from '../src/domain/sites/site.js';
import { SiteStatus } from '../src/domain/sites/site-status.enum.js';

describe('Bloglist-compatible core', () => {
  it('creates and publishes a page without any cluster capability', () => {
    const page = new Page({
      pageId: 'page',
      mark: 'Home',
      siteId: 'site',
      language: 'en',
      clusterId: null,
      type: PageType.STATIC,
      status: PageStatus.DRAFT,
      title: 'Home',
      h1: null,
      metaTitle: null,
      metaDescription: null,
      contentMd: '',
      robotsIndex: true,
      publishedAt: null,
      createdAt: new Date('2026-10-24T10:00:00Z'),
      updatedAt: new Date('2026-10-24T10:00:00Z'),
    });

    page.configureRendering({
      templateId: 'Home',
      delivery: HtmlDelivery.Static,
      interaction: BrowserInteraction.Api,
      parameters: {},
      loaders: [],
    });
    page.publish(new Date('2026-10-24T11:00:00Z'));
    expect(page.clusterId).toBeNull();
    expect(page.toState().rendering?.delivery).toBe(HtmlDelivery.Static);
    page.publish(new Date('2026-10-24T12:00:00Z'));
    expect(page.publishedAt).toEqual(new Date('2026-10-24T11:00:00Z'));
  });

  it('preserves URL identity when becoming a redirect and being rebound', () => {
    const url = new Url({
      urlId: 'url',
      mark: 'GameAddress',
      siteId: 'site',
      parentUrlId: null,
      segment: 'game',
      path: '/game/',
      kind: UrlKind.PAGE,
      pageId: 'first-page',
      redirectTargetUrlId: null,
      redirectStatus: null,
      firstPublishedAt: new Date('2026-10-24T10:00:00Z'),
      createdAt: new Date('2026-10-24T10:00:00Z'),
      updatedAt: new Date('2026-10-24T10:00:00Z'),
    });

    url.redirectTo('new-url', UrlRedirectStatus.HTTP_301);
    url.bindToPage('replacement-page');
    expect(url.toState()).toMatchObject({
      urlId: 'url',
      mark: 'GameAddress',
      path: '/game/',
      kind: UrlKind.PAGE,
      pageId: 'replacement-page',
      redirectTargetUrlId: null,
      redirectStatus: null,
    });
    expect(() => url.bindToPage(' ')).toThrow();
    expect(url.pageId).toBe('replacement-page');
  });

  it('normalizes site hosts and protects language/default invariants', () => {
    const site = new Site({
      siteId: 'site',
      mark: 'Site',
      name: ' Site ',
      primaryDomain: 'EXAMPLE.TEST',
      languages: ['EN'],
      defaultLanguage: 'EN',
      status: SiteStatus.ACTIVE,
      createdAt: new Date('2026-10-24T10:00:00Z'),
      updatedAt: new Date('2026-10-24T10:00:00Z'),
    });

    expect(site.primaryDomain).toBe('example.test');
    expect(() => site.removeLanguage('en')).toThrow();
    expect(() => site.addLanguage('en')).toThrow();
    expect(site.languages).toEqual(['en']);
  });

  it('rejects request-phase work on static pages, dependency cycles and mixed phases', () => {
    const binding = {
      loaderId: 'Data',
      alias: 'data',
      phase: LoaderPhase.Build,
      parameters: {},
      dependsOn: [],
      required: true,
    };
    const rendering = {
      templateId: 'Home',
      delivery: HtmlDelivery.Static,
      interaction: BrowserInteraction.None,
      parameters: {},
      loaders: [binding],
    };

    expect(() => validatePageRendering({
      ...rendering,
      loaders: [{ ...binding, phase: LoaderPhase.Request }],
    })).toThrow();
    expect(() => validatePageRendering({
      ...rendering,
      loaders: [{ ...binding, dependsOn: ['data'] }],
    })).toThrow();
    expect(() => validatePageRendering({
      ...rendering,
      delivery: HtmlDelivery.Request,
      loaders: [{ ...binding, dependsOn: ['current'] },
        { ...binding, alias: 'current', phase: LoaderPhase.Request }],
    })).toThrow();
  });
});
