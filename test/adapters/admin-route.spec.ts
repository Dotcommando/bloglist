import {
  AdminRouteKind, AdminSection, parseAdminRoute, readLastSite, sitePath,
} from '../../admin/src/app/admin-route.js';

describe('administration navigation and last-site preference', () => {
  it('retains the virtual folder path when opening page creation by a deep link', () => {
    expect(parseAdminRoute('/admin/sites/site-1/pages/new?urlPath=%2Fexample%2F')).toMatchObject({
      kind: AdminRouteKind.CreatePage, siteId: 'site-1', virtualFolderPath: '/example/',
    });
  });
  it('supports URLs, page-to-URL and Settings deep links', () => {
    expect(parseAdminRoute('/admin/sites/site-1/urls')).toMatchObject({
      kind: AdminRouteKind.Urls,
      section:
      AdminSection.Urls,
    });
    expect(parseAdminRoute('/admin/sites/site-1/urls/url-1')).toMatchObject({
      urlId: 'url-1',
      section:
      AdminSection.Urls,
    });
    expect(parseAdminRoute('/admin/sites/site-1/urls/-/page/page-1')).toMatchObject({
      urlPageId: 'page-1',
      section:
      AdminSection.Urls,
    });
    expect(parseAdminRoute('/admin/sites/site-1/settings')).toMatchObject({
      kind: AdminRouteKind.Settings,
      section:
      AdminSection.Settings,
    });
  });
  it('supports Snippets list/detail and code creation deep links', () => {
    expect(parseAdminRoute('/admin/sites/site-1/snippets')).toMatchObject({
      kind: AdminRouteKind.Elements, section: AdminSection.Snippets, elementId: null,
    });
    expect(parseAdminRoute('/admin/sites/site-1/snippets/Pagination')).toMatchObject({
      kind: AdminRouteKind.Element, section: AdminSection.Snippets, elementId: 'Pagination',
    });
    expect(parseAdminRoute('/admin/sites/site-1/snippets/-/new')).toMatchObject({
      kind: AdminRouteKind.CreateElement, section: AdminSection.Snippets,
    });
  });
  it('distinguishes site selection, creation, workspace and page editor addresses', () => {
    expect(parseAdminRoute('/admin/').kind).toBe(AdminRouteKind.Home);
    expect(parseAdminRoute('/admin/sites').kind).toBe(AdminRouteKind.Sites);
    expect(parseAdminRoute('/admin/sites/new').kind).toBe(AdminRouteKind.CreateSite);
    expect(parseAdminRoute('/admin/sites/site-1')).toMatchObject({ kind: AdminRouteKind.Site, siteId: 'site-1' });
    expect(parseAdminRoute('/admin/sites/site-1/pages/new')).toMatchObject({ kind: AdminRouteKind.CreatePage });
    expect(parseAdminRoute('/admin/sites/site-1/pages/page-1')).toMatchObject({
      kind: AdminRouteKind.Page, siteId: 'site-1', pageId: 'page-1',
    });
    expect(sitePath('site-1')).toBe('/admin/sites/site-1');
  });
  it('rejects unknown, encoded and oversized paths rather than treating them as a workspace', () => {
    for (const pathname of ['/admin/unknown', '/admin/sites/a/extra', '/admin/sites/%2f',
      '/admin/sites/' + 'x'.repeat(129), '/outside', '/admin/sites/a/pages/b/extra']) {
      expect(parseAdminRoute(pathname).kind).toBe(AdminRouteKind.NotFound);
    }
  });
  it('resolves scoped template and chunk list, create and editor deep links', () => {
    for (const section of [AdminSection.Templates, AdminSection.Chunks]) {
      expect(parseAdminRoute('/admin/sites/site-1/' + section)).toMatchObject({
        kind: AdminRouteKind.Elements, siteId: 'site-1', section, elementId: null,
      });
      expect(parseAdminRoute('/admin/sites/site-1/' + section + '/-/new')).toMatchObject({
        kind: AdminRouteKind.CreateElement, siteId: 'site-1', section, elementId: null,
      });
      expect(parseAdminRoute('/admin/sites/site-1/' + section + '/Header')).toMatchObject({
        kind: AdminRouteKind.Element, siteId: 'site-1', section, elementId: 'Header',
      });
      expect(parseAdminRoute('/admin/sites/site-1/' + section + '/new')).toMatchObject({
        kind: AdminRouteKind.Element, elementId: 'new',
      });
    }

    for (const path of ['/admin/sites/site-1/chunks/%2f', '/admin/sites/site-1/templates/Header/extra',
      '/admin/sites/site-1/templates/' + 'x'.repeat(129)]) {
      expect(parseAdminRoute(path).kind).toBe(AdminRouteKind.NotFound);
    }
  });
  it('reads an untrusted site preference without accepting duplicate or malformed values', () => {
    expect(readLastSite('other=value; zarya_admin_site=site-1')).toBe('site-1');
    expect(readLastSite('zarya_admin_site=%2Fadmin')).toBeNull();
    expect(readLastSite('zarya_admin_site=site-1; zarya_admin_site=site-2')).toBeNull();
    expect(readLastSite('')).toBeNull();
  });
});
