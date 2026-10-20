import { PageRelationshipsService } from '../src/app/services/pages/page-relationships.service.js';
import { PageScopeService } from '../src/app/services/pages/page-scope.service.js';
import { AssignPageToClusterUseCase } from '../src/app/use-cases/pages/assign-page-to-cluster.use-case.js';
import { CreatePageUseCase } from '../src/app/use-cases/pages/create-page.use-case.js';
import { PublishPageUseCase } from '../src/app/use-cases/pages/publish-page.use-case.js';
import { UpdatePageUseCase } from '../src/app/use-cases/pages/update-page.use-case.js';
import { Page } from '../src/domain/pages/page.js';
import { PageConflictError } from '../src/domain/pages/page-conflict.error.js';
import { PageNotFoundError } from '../src/domain/pages/page-not-found.error.js';
import { PageScopeError } from '../src/domain/pages/page-scope.error.js';
import { PageStatus } from '../src/domain/pages/page-status.enum.js';
import { PageType } from '../src/domain/pages/page-type.enum.js';
import type { ICreatePageInput } from '../src/ports/inbound/pages/create-page.port.js';
import type { IClusterLookupPort } from '../src/ports/outbound/pages/cluster-lookup.port.js';
import type { IPageRepository } from '../src/ports/outbound/pages/page.repository.js';
import type { IPageLifecycleValues } from '../src/ports/outbound/pages/page-lifecycle-values.port.js';
import type { ISiteLookupPort } from '../src/ports/outbound/pages/site-lookup.port.js';
import { instant, pageState } from './domain.fixtures.js';
import { clusterLookup, pageRepository, pagesSiteLookup } from './pages.fixtures.js';

interface IPagesScenario {
  pages: IPageRepository;
  sites: ISiteLookupPort;
  clusters: IClusterLookupPort;
  values: IPageLifecycleValues;
  loaded: Page;
  create: CreatePageUseCase;
  update: UpdatePageUseCase;
  assign: AssignPageToClusterUseCase;
  publish: PublishPageUseCase;
}

function operationInstant(): Date {
  return new Date('2026-02-20T03:04:05.000Z');
}

function scenario(): IPagesScenario {
  const pages = pageRepository();
  const sites = pagesSiteLookup();
  const clusters = clusterLookup();
  const scope = new PageScopeService(pages);
  const relationships = new PageRelationshipsService(sites, clusters);
  const values: IPageLifecycleValues = {
    nextPageId: vi.fn<IPageLifecycleValues['nextPageId']>().mockReturnValue('page-new'),
    currentInstant: vi.fn<IPageLifecycleValues['currentInstant']>().mockImplementation(operationInstant),
  };
  const loaded = new Page(pageState());

  vi.mocked(pages.findById).mockResolvedValue(loaded);

  return {
    pages,
    sites,
    clusters,
    values,
    loaded,
    create: new CreatePageUseCase(pages, relationships, values),
    update: new UpdatePageUseCase(pages, scope),
    assign: new AssignPageToClusterUseCase(pages, scope, relationships),
    publish: new PublishPageUseCase(pages, scope, values),
  };
}

function createInput(overrides: Partial<ICreatePageInput> = {}): ICreatePageInput {
  return { mark: 'WoodPage', siteId: 'site-1', language: ' EN ', title: ' Wood ', ...overrides };
}

const target = { siteId: 'site-1', pageId: 'page-1' };

describe('CreatePageUseCase', () => {
  it('creates a normalized DRAFT with schema defaults, a generated identity and explicit UTC instants', async () => {
    const s = scenario();
    const page = await s.create.execute(createInput());
    const at = operationInstant();

    expect(page.toState()).toEqual(pageState({ pageId: 'page-new', createdAt: at, updatedAt: at }));
    expect(s.sites.findSite).toHaveBeenCalledExactlyOnceWith('site-1');
    expect(s.pages.findByMark).toHaveBeenCalledExactlyOnceWith('WoodPage');
    expect(s.clusters.findCluster).not.toHaveBeenCalled();
    expect(s.pages.findById).not.toHaveBeenCalled();
    expect(s.pages.save).toHaveBeenCalledExactlyOnceWith(page);
  });

  it('preserves supplied optional content, empty values and robotsIndex=false', async () => {
    const s = scenario();
    const page = await s.create.execute(createInput({
      clusterId: 'cluster-1',
      type: PageType.MIXED,
      h1: '',
      metaTitle: 'SEO',
      metaDescription: 'Description',
      contentMd: '**Markdown**',
      robotsIndex: false,
    }));

    expect(page.toState()).toMatchObject({
      clusterId: 'cluster-1',
      type: PageType.MIXED,
      h1: '',
      metaTitle: 'SEO',
      metaDescription: 'Description',
      contentMd: '**Markdown**',
      robotsIndex: false,
      status: PageStatus.DRAFT,
      publishedAt: null,
    });
    expect(s.clusters.findCluster).toHaveBeenCalledExactlyOnceWith('cluster-1');
  });

  it('rejects a globally occupied mark even when its owner is another site', async () => {
    const s = scenario();

    vi.mocked(s.pages.findByMark).mockResolvedValue(new Page(pageState({ siteId: 'site-2' })));
    await expect(s.create.execute(createInput())).rejects.toBeInstanceOf(PageConflictError);
    expect(s.pages.save).not.toHaveBeenCalled();
  });

  it.each<Partial<ICreatePageInput>>([
    { title: ' ' }, { language: 'eng' }, { mark: 'invalid-mark' }, { siteId: ' ' }, { clusterId: '' },
  ])('rejects invalid domain input before external lookups: %j', async (overrides) => {
    const s = scenario();

    await expect(s.create.execute(createInput(overrides))).rejects.toBeInstanceOf(RangeError);
    expect(s.sites.findSite).not.toHaveBeenCalled();
    expect(s.pages.save).not.toHaveBeenCalled();
  });

  it('rejects null content from an untyped caller rather than treating it as omitted', async () => {
    const s = scenario();
    const input = createInput();

    Object.assign(input, { contentMd: null });
    await expect(s.create.execute(input)).rejects.toBeInstanceOf(RangeError);
    expect(s.pages.save).not.toHaveBeenCalled();
  });

  it('returns the persisted entity including persistence-owned timestamps', async () => {
    const s = scenario();
    const saved = new Page(pageState({ pageId: 'page-new', updatedAt: operationInstant() }));

    vi.mocked(s.pages.save).mockResolvedValue(saved);
    await expect(s.create.execute(createInput())).resolves.toBe(saved);
  });

  it('propagates a concurrent mark conflict during save without retrying', async () => {
    const s = scenario();
    const failure = new PageConflictError('Concurrent mark registration');

    vi.mocked(s.pages.save).mockRejectedValue(failure);
    await expect(s.create.execute(createInput())).rejects.toBe(failure);
    expect(s.pages.save).toHaveBeenCalledTimes(1);
  });
});

const relationshipOperations = [
  { name: 'create',
    execute: (s: IPagesScenario): Promise<Page> =>
      s.create.execute(createInput({ clusterId: 'cluster-1' })) },
  { name: 'assign',
    execute: (s: IPagesScenario): Promise<Page> =>
      s.assign.execute({ ...target, clusterId: 'cluster-1' }) },
];

describe.each(relationshipOperations)('$name reference checks', ({ execute }) => {
  it('rejects a missing site', async () => {
    const s = scenario();

    vi.mocked(s.sites.findSite).mockResolvedValue(null);
    await expect(execute(s)).rejects.toBeInstanceOf(PageNotFoundError);
    expect(s.pages.save).not.toHaveBeenCalled();
  });

  it('rejects an out-of-scope site lookup result', async () => {
    const s = scenario();

    vi.mocked(s.sites.findSite).mockResolvedValue({ siteId: 'site-2', languages: ['en'] });
    await expect(execute(s)).rejects.toBeInstanceOf(PageScopeError);
    expect(s.clusters.findCluster).not.toHaveBeenCalled();
    expect(s.pages.save).not.toHaveBeenCalled();
  });

  it('rejects a language which is not enabled by the site', async () => {
    const s = scenario();

    vi.mocked(s.sites.findSite).mockResolvedValue({ siteId: 'site-1', languages: ['de'] });
    await expect(execute(s)).rejects.toBeInstanceOf(RangeError);
    expect(s.pages.save).not.toHaveBeenCalled();
  });

  it('rejects a missing cluster', async () => {
    const s = scenario();

    vi.mocked(s.clusters.findCluster).mockResolvedValue(null);
    await expect(execute(s)).rejects.toBeInstanceOf(PageNotFoundError);
    expect(s.pages.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(pageState());
  });

  it('rejects a cluster from another site', async () => {
    const s = scenario();

    vi.mocked(s.clusters.findCluster).mockResolvedValue({ clusterId: 'cluster-1', siteId: 'site-2', language: 'en' });
    await expect(execute(s)).rejects.toBeInstanceOf(PageScopeError);
    expect(s.pages.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(pageState());
  });

  it('rejects a cluster with a different language', async () => {
    const s = scenario();

    vi.mocked(s.clusters.findCluster).mockResolvedValue({ clusterId: 'cluster-1', siteId: 'site-1', language: 'de' });
    await expect(execute(s)).rejects.toBeInstanceOf(RangeError);
    expect(s.pages.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(pageState());
  });

  it('propagates lookup failures without writing', async () => {
    const s = scenario();
    const failure = new Error('Cluster lookup failed');

    vi.mocked(s.clusters.findCluster).mockRejectedValue(failure);
    await expect(execute(s)).rejects.toBe(failure);
    expect(s.pages.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(pageState());
  });
});

describe('UpdatePageUseCase', () => {
  it('updates every supported field while preserving identity, language, cluster and lifecycle', async () => {
    const s = scenario();
    const updated = await s.update.execute({
      ...target,
      title: ' Updated ',
      h1: 'Heading',
      metaTitle: 'SEO',
      metaDescription: 'Description',
      contentMd: '**Markdown**',
      type: PageType.MIXED,
      robotsIndex: false,
    });

    expect(updated.toState()).toEqual(pageState({
      title: 'Updated',
      h1: 'Heading',
      metaTitle: 'SEO',
      metaDescription: 'Description',
      contentMd: '**Markdown**',
      type: PageType.MIXED,
      robotsIndex: false,
    }));
    expect(s.pages.save).toHaveBeenCalledExactlyOnceWith(updated);
    expect(s.loaded.toState()).toEqual(pageState());
  });

  it('preserves omitted fields and permits null to clear nullable content', async () => {
    const s = scenario();

    vi.mocked(s.pages.findById).mockResolvedValue(new Page(pageState({
      h1: 'Heading', metaTitle: 'SEO', metaDescription: 'Description',
    })));
    const updated = await s.update.execute({ ...target, h1: null, metaTitle: null });

    expect(updated.h1).toBeNull();
    expect(updated.metaTitle).toBeNull();
    expect(updated.metaDescription).toBe('Description');
    expect(updated.title).toBe('Wood');
  });

  it('preserves the other SEO field when only description changes', async () => {
    const s = scenario();

    vi.mocked(s.pages.findById).mockResolvedValue(new Page(pageState({ metaTitle: 'SEO' })));
    const updated = await s.update.execute({ ...target, metaDescription: 'New description' });

    expect(updated.metaTitle).toBe('SEO');
    expect(updated.metaDescription).toBe('New description');
  });

  it('preserves all fields when no update fields are supplied', async () => {
    const s = scenario();
    const updated = await s.update.execute(target);

    expect(updated.toState()).toEqual(pageState());
    expect(updated).not.toBe(s.loaded);
  });

  it('accepts empty content and rejects invalid changes without mutating the loaded page', async () => {
    const s = scenario();

    await expect(s.update.execute({ ...target, contentMd: '' })).resolves.toHaveProperty('contentMd', '');
    vi.mocked(s.pages.save).mockClear();
    await expect(s.update.execute({ ...target, title: ' ' })).rejects.toBeInstanceOf(RangeError);
    expect(s.pages.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(pageState());
  });

  it('ignores unexposed fields instead of mass-assigning them into a page', async () => {
    const s = scenario();
    const input = { ...target, title: 'Updated' };

    Object.assign(input, { mark: 'Changed', language: 'de', clusterId: 'other', status: PageStatus.PUBLISHED });
    const updated = await s.update.execute(input);

    expect(updated.toState()).toEqual(pageState({ title: 'Updated' }));
  });
});

describe('AssignPageToClusterUseCase', () => {
  it('assigns a matching cluster while preserving all other fields', async () => {
    const s = scenario();
    const updated = await s.assign.execute({ ...target, clusterId: 'cluster-1' });

    expect(updated.toState()).toEqual(pageState({ clusterId: 'cluster-1' }));
    expect(s.loaded.toState()).toEqual(pageState());
    expect(s.pages.save).toHaveBeenCalledExactlyOnceWith(updated);
  });

  it('unassigns a cluster without relying on external site or cluster lookups', async () => {
    const s = scenario();

    vi.mocked(s.pages.findById).mockResolvedValue(new Page(pageState({ clusterId: 'old-cluster' })));
    const updated = await s.assign.execute({ ...target, clusterId: null });

    expect(updated.clusterId).toBeNull();
    expect(s.clusters.findCluster).not.toHaveBeenCalled();
    expect(s.sites.findSite).not.toHaveBeenCalled();
  });

  it('rejects a blank cluster identity before any reference lookup or write', async () => {
    const s = scenario();

    await expect(s.assign.execute({ ...target, clusterId: ' ' })).rejects.toBeInstanceOf(RangeError);
    expect(s.clusters.findCluster).not.toHaveBeenCalled();
    expect(s.pages.save).not.toHaveBeenCalled();
  });
});

describe('PublishPageUseCase', () => {
  it('publishes a draft at an explicit UTC instant without changing content or persistence timestamps', async () => {
    const s = scenario();
    const published = await s.publish.execute(target);

    expect(published.toState()).toEqual(pageState({ status: PageStatus.PUBLISHED, publishedAt: operationInstant() }));
    expect(s.loaded.toState()).toEqual(pageState());
    expect(s.values.currentInstant).toHaveBeenCalledTimes(1);
    expect(s.values.nextPageId).not.toHaveBeenCalled();
    expect(s.pages.save).toHaveBeenCalledExactlyOnceWith(published);
  });

  it.each([PageStatus.PUBLISHED, PageStatus.ARCHIVED])('preserves first publication for %s', async (status) => {
    const s = scenario();

    vi.mocked(s.pages.findById).mockResolvedValue(new Page(pageState({
      status, publishedAt: instant(), robotsIndex: false,
    })));
    const published = await s.publish.execute(target);

    expect(published.status).toBe(PageStatus.PUBLISHED);
    expect(published.publishedAt).toEqual(instant());
    expect(published.robotsIndex).toBe(false);
  });

  it('publishes an archived page which has never been published', async () => {
    const s = scenario();

    vi.mocked(s.pages.findById).mockResolvedValue(new Page(pageState({ status: PageStatus.ARCHIVED })));
    await expect(s.publish.execute(target)).resolves.toHaveProperty('publishedAt', operationInstant());
  });

  it('rejects an invalid publication instant before writing', async () => {
    const s = scenario();

    vi.mocked(s.values.currentInstant).mockReturnValue(new Date('invalid'));
    await expect(s.publish.execute(target)).rejects.toBeInstanceOf(RangeError);
    expect(s.pages.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(pageState());
  });
});

const existingPageOperations = [
  { name: 'update', execute: (s: IPagesScenario): Promise<Page> => s.update.execute({ ...target, title: 'Updated' }) },
  { name: 'assign',
    execute: (s: IPagesScenario): Promise<Page> =>
      s.assign.execute({ ...target, clusterId: 'cluster-1' }) },
  { name: 'publish', execute: (s: IPagesScenario): Promise<Page> => s.publish.execute(target) },
];

describe.each(existingPageOperations)('$name existing-page preconditions and failures', ({ execute }) => {
  it('rejects a missing page', async () => {
    const s = scenario();

    vi.mocked(s.pages.findById).mockResolvedValue(null);
    await expect(execute(s)).rejects.toBeInstanceOf(PageNotFoundError);
    expect(s.pages.findById).toHaveBeenCalledExactlyOnceWith('page-1');
    expect(s.pages.save).not.toHaveBeenCalled();
  });

  it('rejects a page owned by another site before reference lookups or writes', async () => {
    const s = scenario();

    vi.mocked(s.pages.findById).mockResolvedValue(new Page(pageState({ siteId: 'site-2' })));
    await expect(execute(s)).rejects.toBeInstanceOf(PageScopeError);
    expect(s.sites.findSite).not.toHaveBeenCalled();
    expect(s.clusters.findCluster).not.toHaveBeenCalled();
    expect(s.pages.save).not.toHaveBeenCalled();
    expect(s.values.currentInstant).not.toHaveBeenCalled();
  });

  it('propagates a lookup failure without writing', async () => {
    const s = scenario();
    const failure = new Error('Page lookup failed');

    vi.mocked(s.pages.findById).mockRejectedValue(failure);
    await expect(execute(s)).rejects.toBe(failure);
    expect(s.pages.save).not.toHaveBeenCalled();
  });

  it('propagates a save failure and leaves the loaded entity unchanged', async () => {
    const s = scenario();
    const failure = new Error('Save failed');

    vi.mocked(s.pages.save).mockRejectedValue(failure);
    await expect(execute(s)).rejects.toBe(failure);
    expect(s.pages.save).toHaveBeenCalledTimes(1);
    expect(s.loaded.toState()).toEqual(pageState());
  });

  it('returns the actual saved entity', async () => {
    const s = scenario();
    const saved = new Page(pageState({ updatedAt: operationInstant() }));

    vi.mocked(s.pages.save).mockResolvedValue(saved);
    await expect(execute(s)).resolves.toBe(saved);
  });
});
