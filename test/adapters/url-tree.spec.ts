import { siteLink, urlTree } from '../../admin/src/features/urls/url-tree.js';
import type { IUrlCatalog } from '../../admin/src/features/urls/urls.types.js';
import { PublishedUrlKind, UrlKind } from '../../admin/src/features/urls/urls.types.js';

describe('URL tree projections', () => {
  it('includes virtual prefixes, preserves exact trailing slashes and tracks the active sitemap', () => {
    const row = {
      url: {
        urlId: 'u',
        siteId: 'site',
        mark: 'U',
        path: '/services/consultation/',
        segment: 'consultation',
        parentUrlId: null,
        kind: UrlKind.Page,
        pageId: 'page',
        redirectTargetUrlId: null,
        redirectStatus: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      version: 'v',
    };
    const catalog: IUrlCatalog = {
      siteId: 'site',
      urls: [row, { ...row, url: { ...row.url, urlId: 'other', path: '/services' } }],
      pages: [],
      published: {
        releaseId: 'r',
        sitemapPaths: ['/services/consultation/'],
        routes: [{ urlId: 'u', path: row.url.path, kind: PublishedUrlKind.Static, pageId: 'page' }],
      },
    };
    const tree = urlTree(catalog);

    expect(tree.map((node) => node.path).sort()).toEqual(['/', '/services', '/services/', '/services/consultation/']);
    expect(tree.find((node) => node.path === '/services/')).toMatchObject({ row: null, parent: '/', inSitemap: false });
    expect(tree.find((node) => node.path === row.url.path)).toMatchObject({ parent: '/services/', inSitemap: true });
    expect(siteLink('https://example.test',
      '/services/consultation/')).toBe('https://example.test/services/consultation/');
    expect(siteLink('https://example.test', '//foreign.test/')).toBeNull();
  });
});
