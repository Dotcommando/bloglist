import { model, Types } from 'mongoose';

import { ClusterSchema } from '../src/clusters/adapters/outbound/persistence/mongodb/cluster.schema.js';
import { ClusterBlogSchema } from '../src/clusters/adapters/outbound/persistence/mongodb/cluster-blog.schema.js';
import { BlogSchema } from '../src/creators/adapters/outbound/persistence/mongodb/blog.schema.js';
import { BloggerSchema } from '../src/creators/adapters/outbound/persistence/mongodb/blogger.schema.js';
import { PageSchema } from '../src/pages/adapters/outbound/persistence/mongodb/page.schema.js';
import { UrlSchema } from '../src/routing/adapters/outbound/persistence/mongodb/url.schema.js';
import { UrlHistorySchema } from '../src/routing/adapters/outbound/persistence/mongodb/url-history.schema.js';
import { SiteSchema } from '../src/sites/adapters/outbound/persistence/mongodb/site.schema.js';

const SiteModel = model('SchemaTestSite', SiteSchema);

const ClusterModel = model('SchemaTestCluster', ClusterSchema);

const PageModel = model('SchemaTestPage', PageSchema);

const UrlModel = model('SchemaTestUrl', UrlSchema);

const UrlHistoryModel = model('SchemaTestUrlHistory', UrlHistorySchema);

const BloggerModel = model('SchemaTestBlogger', BloggerSchema);

const BlogModel = model('SchemaTestBlog', BlogSchema);

const ClusterBlogModel = model('SchemaTestClusterBlog', ClusterBlogSchema);

describe('MongoDB schemas without a database connection', () => {
  it('accepts the agreed minimal documents and applies defaults', async () => {
    const siteId = new Types.ObjectId();
    const clusterId = new Types.ObjectId();
    const bloggerId = new Types.ObjectId();
    const blogId = new Types.ObjectId();
    const pageId = new Types.ObjectId();
    const urlId = new Types.ObjectId();
    const site = new SiteModel({ mark: 'Wood', name: 'Wood', primaryDomain: ' EXAMPLE.COM ' });
    const page = new PageModel({ mark: 'WoodPage', siteId, language: ' EN ', title: 'Wood' });
    const membership = new ClusterBlogModel({ clusterId, blogId, position: 125.5 });
    const documents = [
      site,
      new ClusterModel({ mark: 'WoodCluster', siteId, language: 'en', name: 'Wood' }),
      page,
      new UrlModel({ mark: 'WoodUrl', siteId, segment: 'wood', path: '/wood/', kind: 'PAGE', pageId }),
      new UrlHistoryModel({ urlId, kind: 'PAGE', pageId }),
      new BloggerModel({ mark: 'John', name: 'John' }),
      new BlogModel({ mark: 'JohnChannel', bloggerId, platform: 'YOUTUBE', name: 'John', url: 'https://example.com' }),
      membership,
    ];

    for (const document of documents) {
      await expect(document.validate()).resolves.toBeUndefined();
      expect(document._id).toBeInstanceOf(Types.ObjectId);
    }

    expect(site.primaryDomain).toBe('example.com');
    expect(site.languages).toEqual(['en']);
    expect(site.defaultLanguage).toBe('en');
    expect(page.language).toBe('en');
    expect(page.contentMd).toBe('');
    expect(page.status).toBe('DRAFT');
    expect(membership.visible).toBe(true);
  });

  it('rejects whitespace in marks and preserves existing marks', async () => {
    const invalid = new BloggerModel({ mark: 'John Smith', name: 'John' });
    const existing = BloggerModel.hydrate({ _id: new Types.ObjectId(), mark: 'John', name: 'John' });

    await expect(invalid.validate()).rejects.toMatchObject({ errors: { mark: expect.anything() } });
    existing.mark = 'Changed';
    expect(existing.mark).toBe('John');
  });

  it('rejects invalid enums, missing references, negative followers and null page content', async () => {
    await expect(new BloggerModel({ mark: 'John', name: 'John', type: 'INVALID' }).validate()).rejects.toMatchObject({
      errors: { type: expect.anything() },
    });
    await expect(new ClusterBlogModel({ position: 100 }).validate()).rejects.toMatchObject({
      errors: { clusterId: expect.anything() },
    });
    await expect(new BlogModel({ followers: -1 }).validate()).rejects.toMatchObject({
      errors: { followers: expect.anything() },
    });
    await expect(new UrlModel({ redirectStatus: 302 }).validate()).rejects.toMatchObject({
      errors: { redirectStatus: expect.anything() },
    });
    await expect(new PageModel({ contentMd: null }).validate()).rejects.toMatchObject({
      errors: { contentMd: expect.anything() },
    });
  });

  it('declares case-insensitive unique marks and disables automatic database changes', () => {
    const schemas = [SiteSchema, ClusterSchema, PageSchema, UrlSchema, BloggerSchema, BlogSchema];

    for (const schema of schemas) {
      expect(schema.indexes()).toContainEqual([
        { mark: 1 },
        expect.objectContaining({ unique: true, collation: { locale: 'en', strength: 2 } }),
      ]);
      expect(schema.get('autoIndex')).toBe(false);
      expect(schema.get('autoCreate')).toBe(false);
    }

    expect(UrlHistorySchema.path('mark')).toBeUndefined();
    expect(ClusterBlogSchema.path('mark')).toBeUndefined();
    expect(UrlHistorySchema.path('createdAt')).toBeDefined();
    expect(UrlHistorySchema.path('updatedAt')).toBeUndefined();
  });

  it('declares routing and catalog uniqueness with the agreed partial filters', () => {
    expect(UrlSchema.indexes()).toContainEqual([
      { siteId: 1, path: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    expect(UrlSchema.indexes()).toContainEqual([
      { pageId: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { kind: 'PAGE', pageId: { $type: 'objectId' } },
      }),
    ]);
    expect(BlogSchema.indexes()).toContainEqual([
      { platform: 1, externalId: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { externalId: { $type: 'string' } } }),
    ]);
    expect(ClusterBlogSchema.indexes()).toContainEqual([
      { clusterId: 1, blogId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });
});
