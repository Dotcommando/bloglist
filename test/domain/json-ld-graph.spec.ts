import {
  assembleJsonLdGraph, JsonLdReferenceKind, JsonLdRouteKind, JsonLdValueKind, serializeJsonLd,
} from '../../src/domain/json-ld/json-ld-graph.js';

describe('JSON-LD graph assembly', () => {
  const origin = 'https://example.test';

  it('collects referenced objects once, permits cycles and emits safe script content', () => {
    const result = assembleJsonLdGraph({
      origin,
      root: 'article',
      routes: [],
      nodes: [
        {
          key: 'article',
          role: 'article',
          type: 'Article',
          properties: {
            headline: { kind: JsonLdValueKind.Text, value: '</script><script>alert(1)</script>' },
            author: { kind: JsonLdValueKind.Node, key: 'author', required: true },
            publisher: { kind: JsonLdValueKind.Node, key: 'author', required: true },
          },
        },
        {
          key: 'author',
          role: 'person',
          type: 'Person',
          properties: {
            name: { kind: JsonLdValueKind.Text, value: 'Alice' },
            subjectOf: { kind: JsonLdValueKind.Node, key: 'article', required: true },
          },
        },
      ],
    });

    expect(result.graph['@graph']).toHaveLength(2);
    expect(result.graph['@graph'][0]?.author).toEqual({ '@id': 'https://example.test/#person-author' });
    const serialized = serializeJsonLd(result.graph);

    expect(serialized).not.toContain('</script>');
    expect(JSON.parse(serialized)).toEqual(result.graph);
  });

  it('keeps exact redirected addresses and follows current page addresses', () => {
    const result = assembleJsonLdGraph({
      origin,
      root: 'article',
      nodes: [{
        key: 'article',
        role: 'article',
        type: 'Article',
        properties: {
          url: {
            kind: JsonLdValueKind.Url, reference: { kind: JsonLdReferenceKind.Page, pageId: 'p' }, required: true,
          },
          contentUrl: {
            kind: JsonLdValueKind.Url,
            reference: { kind: JsonLdReferenceKind.Exact, urlId: 'old', pageId: 'p' },
            required: true,
          },
        },
      }],
      routes: [
        { kind: JsonLdRouteKind.Page, pageId: 'p', urlId: 'new', path: '/new/' },
        { kind: JsonLdRouteKind.Redirect, urlId: 'old', pageId: 'p', path: '/old/' },
      ],
    });

    expect(result.graph['@graph'][0]?.url).toBe('https://example.test/new/');
    expect(result.graph['@graph'][0]?.contentUrl).toBe('https://example.test/old/');
    expect(result.warnings).toEqual([{ node: 'article', property: 'contentUrl', urlId: 'old' }]);
  });

  it('includes every selected profile root and excludes unrelated shared objects', () => {
    const result = assembleJsonLdGraph({
      origin,
      root: 'article',
      additionalRoots: ['page'],
      routes: [],
      nodes: [
        { key: 'article', role: 'article', type: 'Article', properties: {} },
        { key: 'page', role: 'page', type: 'WebPage', properties: {} },
        { key: 'unused', role: 'person', type: 'Person', properties: {} },
      ],
    });

    expect(result.graph['@graph'].map((item) => item['@type'])).toEqual(['Article', 'WebPage']);
  });

  it('preserves typed literal values and rejects non-finite numbers', () => {
    const graph = assembleJsonLdGraph({
      origin,
      root: 'page',
      routes: [],
      nodes: [{
        key: 'page',
        role: 'page',
        type: 'WebPage',
        properties: {
          count: { kind: JsonLdValueKind.Number, value: 3 },
          accessible: { kind: JsonLdValueKind.Boolean, value: false },
        },
      }],
    }).graph;

    expect(graph['@graph'][0]?.count).toBe(3);
    expect(graph['@graph'][0]?.accessible).toBe(false);
    expect(() => assembleJsonLdGraph({
      origin,
      root: 'page',
      routes: [],
      nodes: [{
        key: 'page',
        role: 'page',
        type: 'WebPage',
        properties: {
          count: { kind: JsonLdValueKind.Number, value: Number.POSITIVE_INFINITY },
        },
      }],
    })).toThrow('Invalid JSON-LD number: page.count');
  });

  it('uses the configured origin for identities and omits absent optional references', () => {
    const node = {
      key: 'article',
      role: 'article',
      type: 'Article',
      properties: {
        author: { kind: JsonLdValueKind.Node as const, key: 'absent', required: false },
      },
    };
    const first = assembleJsonLdGraph({ origin, root: 'article', routes: [], nodes: [node] });
    const moved = assembleJsonLdGraph({ origin: 'https://new.example.test', root: 'article', routes: [], nodes: [node] });

    expect(first.graph['@graph'][0]).not.toHaveProperty('author');
    expect(first.graph['@graph'][0]?.['@id']).toBe('https://example.test/#article-article');
    expect(moved.graph['@graph'][0]?.['@id']).toBe('https://new.example.test/#article-article');
  });

  it('accepts external identity URLs while rejecting unsafe URL schemes', () => {
    const node = {
      key: 'author',
      role: 'person',
      type: 'Person',
      properties: {
        sameAs: {
          kind: JsonLdValueKind.Url as const,
          required: true,
          reference: { kind: JsonLdReferenceKind.External as const, url: 'https://profiles.example.test/alice' },
        },
      },
    };
    const graph = assembleJsonLdGraph({ origin, root: 'author', routes: [], nodes: [node] }).graph;

    expect(graph['@graph'][0]?.sameAs).toBe('https://profiles.example.test/alice');
    expect(() => assembleJsonLdGraph({
      origin,
      root: 'author',
      routes: [],
      nodes: [{
        ...node,
        properties: {
          sameAs: {
            ...node.properties.sameAs,
            reference: {
              kind: JsonLdReferenceKind.External, url: 'javascript:alert(1)',
            },
          },
        },
      }],
    })).toThrow('Invalid JSON-LD URL: author.sameAs');
  });

  it('rejects an exact address rebound to a different page', () => {
    expect(() => assembleJsonLdGraph({
      origin,
      root: 'article',
      nodes: [{
        key: 'article',
        role: 'article',
        type: 'Article',
        properties: {
          url: {
            kind: JsonLdValueKind.Url,
            required: true,
            reference: { kind: JsonLdReferenceKind.Exact, urlId: 'old', pageId: 'original' },
          },
        },
      }],
      routes: [{ kind: JsonLdRouteKind.Page, pageId: 'other', urlId: 'old', path: '/old/' }],
    })).toThrow('Rebound JSON-LD reference: article.url');
  });

  it('rejects missing required references and conflicting node contributions', () => {
    expect(() => assembleJsonLdGraph({
      origin,
      root: 'article',
      routes: [],
      nodes: [
        {
          key: 'article',
          role: 'article',
          type: 'Article',
          properties: {
            author: { kind: JsonLdValueKind.Node, key: 'missing', required: true },
          },
        },
      ],
    })).toThrow('article.author');
    expect(() => assembleJsonLdGraph({
      origin,
      root: 'article',
      routes: [],
      nodes: [
        {
          key: 'article',
          role: 'article',
          type: 'Article',
          properties: {
            headline: { kind: JsonLdValueKind.Text, value: 'One' },
          },
        },
        {
          key: 'article',
          role: 'article',
          type: 'Article',
          properties: {
            headline: { kind: JsonLdValueKind.Text, value: 'Two' },
          },
        },
      ],
    })).toThrow('article.headline');
  });
});
