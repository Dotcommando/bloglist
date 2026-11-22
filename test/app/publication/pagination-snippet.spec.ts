import { PaginationSnippet } from '../../../src/app/services/publication/pagination.snippet.js';
import { LoaderPhase } from '../../../src/domain/pages/page-rendering.js';

describe('bundled Pagination Snippet', () => {
  const catalog = [
    {
      siteId: 'site-1',
      pageId: 'parent',
      urlId: 'parent-url',
      parentUrlId: null,
      path: '/examples/',
      title: 'Examples',
      language: 'en',
    },
    ...Array.from({ length: 35 }, (_, index) => ({
      siteId: 'site-1',
      pageId: 'child-' + (index + 1),
      urlId: 'url-' + index,
      parentUrlId: 'parent-url',
      path: '/examples/child-' + String(index + 1).padStart(2, '0') + '/',
      title: 'Child ' + (index + 1),
      language: 'en',
    })),
  ];
  const context = {
    siteId: 'site-1',
    pageId: 'parent',
    language: 'en',
    phase: LoaderPhase.Request,
    preview: false,
    signal: new AbortController().signal,
    publishedPages: catalog,
  };

  it('returns ten direct children and numbered page links, then five on the last page', async () => {
    const snippet = new PaginationSnippet();
    const first = await snippet.read({ page: '1', pageSize: 10 }, context);

    expect(first).toMatchObject({ page: 1, total: 35, totalPages: 4, hasPages: true });
    expect(first.items).toHaveLength(10);
    expect(first.items[0]).toMatchObject({ title: 'Child 1' });
    expect(first.links.map((link) => link.href)).toEqual(['?page=1', '?page=2', '?page=3', '?page=4']);
    const last = await snippet.read({ page: '4', pageSize: 10 }, context);

    expect(last.items).toHaveLength(5);
    expect(last.items[0]).toMatchObject({ title: 'Child 31' });
    expect(last.links[3]).toMatchObject({ current: true, ariaCurrent: 'page' });
  });

  it('normalizes invalid pages, clamps overflow and handles empty children', async () => {
    const snippet = new PaginationSnippet();

    for (const page of ['', '0', '-1', '1.5', 'NaN', '<script>']) {
      expect((await snippet.read({ page, pageSize: 10 }, context)).page).toBe(1);
    }
    expect((await snippet.read({ page: '999999999999999999999', pageSize: 10 }, context)).page).toBe(4);
    expect(await snippet.read({ parentId: 'missing', page: '2', pageSize: 10 }, context))
      .toMatchObject({ page: 1, total: 0, totalPages: 0, items: [], links: [], hasPages: false });
    await expect(snippet.read({ page: '1', pageSize: 0 }, context)).rejects.toMatchObject({ code: 'Validation' });
  });

  it('isolates site, language and direct parent, and bounds navigation for large catalogs', async () => {
    const snippet = new PaginationSnippet();
    const result = await snippet.read({ page: '1', pageSize: 10 }, {
      ...context,
      publishedPages: [
        ...catalog,
        { ...catalog[1]!, siteId: 'other', pageId: 'foreign' },
        { ...catalog[1]!, language: 'ru', pageId: 'translation' },
        { ...catalog[1]!, parentUrlId: 'url-1', pageId: 'grandchild' },
      ],
    });

    expect(result.total).toBe(35);
    const large = await snippet.read({ page: '50', pageSize: 1 }, {
      ...context,
      publishedPages: [catalog[0]!,
        ...Array.from({ length: 100 }, (_, index) => ({
          ...catalog[1]!,
          pageId: 'p' + index,
          urlId: 'u' + index,
          path: '/examples/' + index + '/',
        })),
      ],
    });

    expect(large.links.length).toBeLessThanOrEqual(9);
    expect(large.links[0]!.page).toBe(1);
    expect(large.links.at(-1)!.page).toBe(100);
  });
});
