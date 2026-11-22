import {
  parsePageCreation, parsePageUpdate, parseSiteCreation,
} from '../../src/adapters/inbound/rest/content/admin-content.parser.js';

describe('admin content input translation', () => {
  it('accepts editable SEO/social fields and rejects wrong types', () => {
    const fields = {
      h1: 'Heading',
      metaTitle: 'Search',
      metaDescription: null,
      robotsIndex: false,
      ogTitle: 'Social',
      ogDescription: '',
      ogImage: 'https://example.test/share.webp',
      ogType: 'article',
    };
    const body = { title: 'Home', contentMd: '', ...fields };

    expect(parsePageCreation({ mark: 'Home', language: 'en', ...body }, 'site')).toMatchObject(fields);
    expect(parsePageUpdate(body, 'site', 'page')).toMatchObject(fields);

    for (const field of ['h1', 'metaTitle', 'metaDescription', 'ogTitle', 'ogDescription', 'ogImage', 'ogType']) {
      expect(() => parsePageUpdate({ ...body, [field]: 1 }, 'site', 'page')).toThrow();
    }
    expect(() => parsePageUpdate({ ...body, robotsIndex: 'false' }, 'site', 'page')).toThrow();
    expect(() => parsePageUpdate({ ...body, ogType: 'unsupported' }, 'site', 'page')).toThrow();
  });
  it('rejects caller-supplied ownership, actor and publication fields', () => {
    const site = {
      mark: 'Example', name: 'Example', primaryDomain: 'example.test', languages: ['en'], defaultLanguage: 'en',
    };

    expect(parseSiteCreation(site)).toEqual(site);
    expect(() => parseSiteCreation({ ...site, actorId: 'operator' })).toThrow();
    const page = { mark: 'Home', language: 'en', title: 'Home', contentMd: '' };

    expect(parsePageCreation(page, 'trusted-site')).toEqual({ ...page, siteId: 'trusted-site' });

    for (const field of ['siteId', 'pageId', 'actorId', 'status', 'publishedAt', 'rendering']) {
      expect(() => parsePageCreation({ ...page, [field]: 'untrusted' }, 'trusted-site')).toThrow();
    }
    expect(() => parsePageUpdate({ title: 'Home', contentMd: '', siteId: 'other' }, 'site', 'page')).toThrow();
    expect(() => parseSiteCreation({ ...site, languages: [2] })).toThrow();
    expect(() => parsePageCreation({ ...page, contentMd: {} }, 'site')).toThrow();
  });
});
