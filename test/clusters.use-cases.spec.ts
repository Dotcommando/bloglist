import { CreateClusterUseCase } from '../src/app/use-cases/clusters/create-cluster.use-case.js';
import { GetClusterUseCase } from '../src/app/use-cases/clusters/get-cluster.use-case.js';
import { ListClustersUseCase } from '../src/app/use-cases/clusters/list-clusters.use-case.js';
import { UpdateClusterUseCase } from '../src/app/use-cases/clusters/update-cluster.use-case.js';
import { Cluster } from '../src/domain/clusters/cluster.js';
import { ClusterConflictError } from '../src/domain/clusters/cluster-conflict.error.js';
import type { IClusterFilter } from '../src/domain/clusters/cluster-filter.js';
import { ClusterNotFoundError } from '../src/domain/clusters/cluster-not-found.error.js';
import { ClusterScopeError } from '../src/domain/clusters/cluster-scope.error.js';
import { ClusterStatus } from '../src/domain/clusters/cluster-status.enum.js';
import type { ICreateClusterInput } from '../src/ports/inbound/clusters/create-cluster.port.js';
import { clusterRepository, clustersSiteLookup } from './clusters.fixtures.js';
import { clusterState, instant } from './domain.fixtures.js';

const creationValues = { nextClusterId: (): string => 'cluster-new', currentInstant: instant };

const target = { siteId: 'site-1', clusterId: 'cluster-1' };

function createInput(overrides: Partial<ICreateClusterInput> = {}): ICreateClusterInput {
  return { mark: 'WoodCluster', siteId: 'site-1', language: ' EN ', name: ' Wood ', ...overrides };
}

describe('CreateClusterUseCase', () => {
  it('creates an ACTIVE root cluster with normalized values, nullable defaults and UTC instants', async () => {
    const clusters = clusterRepository();
    const sites = clustersSiteLookup();
    const cluster = await new CreateClusterUseCase(clusters, sites, creationValues).execute(createInput());

    expect(cluster.toState()).toEqual(clusterState({ clusterId: 'cluster-new' }));
    expect(sites.findSite).toHaveBeenCalledExactlyOnceWith('site-1');
    expect(clusters.findByMark).toHaveBeenCalledExactlyOnceWith('WoodCluster');
    expect(clusters.findById).not.toHaveBeenCalled();
    expect(clusters.save).toHaveBeenCalledExactlyOnceWith(cluster);
  });

  it('checks parent site/language and normalizes optional metadata through domain operations', async () => {
    const clusters = clusterRepository();
    const parent = new Cluster(clusterState({ clusterId: 'parent' }));

    vi.mocked(clusters.findById).mockResolvedValue(parent);
    const cluster = await new CreateClusterUseCase(clusters, clustersSiteLookup(), creationValues).execute(createInput({
      parentClusterId: 'parent',
      descriptionMd: '**Description**',
      industry: ' Wood ',
      geography: ' UK ',
      primaryQuery: ' woodturners ',
    }));

    expect(cluster.toState()).toMatchObject({
      parentClusterId: 'parent',
      descriptionMd: '**Description**',
      industry: 'Wood',
      geography: 'UK',
      primaryQuery: 'woodturners',
    });
    expect(clusters.findById).toHaveBeenCalledExactlyOnceWith('parent');
    expect(parent.toState()).toEqual(clusterState({ clusterId: 'parent' }));
  });

  it('rejects a missing site', async () => {
    const clusters = clusterRepository();
    const sites = clustersSiteLookup();

    vi.mocked(sites.findSite).mockResolvedValue(null);
    await expect(new CreateClusterUseCase(clusters, sites, creationValues).execute(createInput()))
      .rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('rejects a different site returned by the site lookup', async () => {
    const clusters = clusterRepository();
    const sites = clustersSiteLookup();

    vi.mocked(sites.findSite).mockResolvedValue({ siteId: 'site-2', languages: ['en'] });
    await expect(new CreateClusterUseCase(clusters, sites, creationValues).execute(createInput()))
      .rejects.toBeInstanceOf(ClusterScopeError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('rejects a language not enabled by the site', async () => {
    const clusters = clusterRepository();
    const sites = clustersSiteLookup();

    vi.mocked(sites.findSite).mockResolvedValue({ siteId: 'site-1', languages: ['de'] });
    await expect(new CreateClusterUseCase(clusters, sites, creationValues).execute(createInput()))
      .rejects.toBeInstanceOf(RangeError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('rejects a missing parent before saving', async () => {
    const clusters = clusterRepository();

    await expect(new CreateClusterUseCase(clusters, clustersSiteLookup(), creationValues)
      .execute(createInput({ parentClusterId: 'missing' }))).rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('rejects another site as parent', async () => {
    const clusters = clusterRepository();

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState({ siteId: 'site-2' })));
    await expect(new CreateClusterUseCase(clusters, clustersSiteLookup(), creationValues)
      .execute(createInput({ parentClusterId: 'cluster-1' }))).rejects.toBeInstanceOf(ClusterScopeError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('rejects a parent using another language', async () => {
    const clusters = clusterRepository();

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState({ language: 'de' })));
    await expect(new CreateClusterUseCase(clusters, clustersSiteLookup(), creationValues)
      .execute(createInput({ parentClusterId: 'cluster-1' }))).rejects.toBeInstanceOf(RangeError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('rejects an occupied global mark even when the existing cluster belongs to another site', async () => {
    const clusters = clusterRepository();

    vi.mocked(clusters.findByMark).mockResolvedValue(new Cluster(clusterState({ siteId: 'site-2' })));
    await expect(new CreateClusterUseCase(clusters, clustersSiteLookup(), creationValues).execute(createInput()))
      .rejects.toBeInstanceOf(ClusterConflictError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it.each<Partial<ICreateClusterInput>>([
    { name: ' ' }, { mark: 'bad-mark' }, { language: 'eng' }, { siteId: '' },
    { parentClusterId: '' }, { parentClusterId: 'cluster-new' },
  ])('rejects invalid domain values before any external lookup: %j', async (overrides) => {
    const clusters = clusterRepository();
    const sites = clustersSiteLookup();

    await expect(new CreateClusterUseCase(clusters, sites, creationValues).execute(createInput(overrides)))
      .rejects.toBeInstanceOf(RangeError);
    expect(sites.findSite).not.toHaveBeenCalled();
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('returns the actual saved entity and propagates concurrent uniqueness failure without retries', async () => {
    const clusters = clusterRepository();
    const saved = new Cluster(clusterState({ clusterId: 'cluster-new', updatedAt: new Date('2026-02-01T00:00:00Z') }));
    const failure = new ClusterConflictError('Concurrent mark registration');
    const create = new CreateClusterUseCase(clusters, clustersSiteLookup(), creationValues);

    vi.mocked(clusters.save).mockResolvedValueOnce(saved).mockRejectedValueOnce(failure);
    await expect(create.execute(createInput())).resolves.toBe(saved);
    await expect(create.execute(createInput())).rejects.toBe(failure);
    expect(clusters.save).toHaveBeenCalledTimes(2);
  });

  it('propagates site lookup failures without writing', async () => {
    const clusters = clusterRepository();
    const sites = clustersSiteLookup();
    const failure = new Error('Site lookup failed');

    vi.mocked(sites.findSite).mockRejectedValue(failure);
    await expect(new CreateClusterUseCase(clusters, sites, creationValues).execute(createInput()))
      .rejects.toBe(failure);
    expect(clusters.save).not.toHaveBeenCalled();
  });
});

describe('UpdateClusterUseCase', () => {
  it.each([ClusterStatus.ACTIVE, ClusterStatus.ARCHIVED])('edits a %s cluster without changing ownership or hierarchy',
    async (status) => {
      const clusters = clusterRepository();
      const state = clusterState({ status, parentClusterId: 'parent' });
      const loaded = new Cluster(state);

      vi.mocked(clusters.findById).mockResolvedValue(loaded);
      const updated = await new UpdateClusterUseCase(clusters).execute({
        ...target,
        name: ' Updated ',
        descriptionMd: '**Description**',
        industry: ' Wood ',
        geography: ' UK ',
        primaryQuery: ' woodturners ',
      });

      expect(updated.toState()).toEqual({
        ...state,
        name: 'Updated',
        descriptionMd: '**Description**',
        industry: 'Wood',
        geography: 'UK',
        primaryQuery: 'woodturners',
      });
      expect(loaded.toState()).toEqual(state);
      expect(clusters.save).toHaveBeenCalledExactlyOnceWith(updated);
    });

  it('preserves omitted fields and clears nullable fields when explicitly null', async () => {
    const clusters = clusterRepository();
    const state = clusterState({
      descriptionMd: 'Description', industry: 'Wood', geography: 'UK', primaryQuery: 'query',
    });

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(state));
    const update = new UpdateClusterUseCase(clusters);
    const unchanged = await update.execute(target);
    const cleared = await update.execute({ ...target, descriptionMd: null, industry: null, geography: null });

    expect(unchanged.toState()).toEqual(state);
    expect(cleared.toState()).toEqual({ ...state, descriptionMd: null, industry: null, geography: null });
    await expect(update.execute({ ...target, primaryQuery: null })).resolves.toHaveProperty('primaryQuery', null);
  });

  it('ignores unexposed fields and accepts empty nullable text', async () => {
    const clusters = clusterRepository();
    const input = { ...target, descriptionMd: '' };

    Object.assign(input, { mark: 'Other', language: 'de', parentClusterId: 'other', status: ClusterStatus.ARCHIVED });
    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
    const updated = await new UpdateClusterUseCase(clusters).execute(input);

    expect(updated.toState()).toEqual(clusterState({ descriptionMd: '' }));
  });

  it('rejects an invalid change without writing or mutating the loaded object', async () => {
    const clusters = clusterRepository();
    const loaded = new Cluster(clusterState());

    vi.mocked(clusters.findById).mockResolvedValue(loaded);
    await expect(new UpdateClusterUseCase(clusters).execute({ ...target, name: ' ' }))
      .rejects.toBeInstanceOf(RangeError);
    expect(clusters.save).not.toHaveBeenCalled();
    expect(loaded.toState()).toEqual(clusterState());
  });

  it('rejects a missing cluster', async () => {
    const clusters = clusterRepository();

    await expect(new UpdateClusterUseCase(clusters).execute(target)).rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('rejects another site before updating', async () => {
    const clusters = clusterRepository();

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState({ siteId: 'site-2' })));
    await expect(new UpdateClusterUseCase(clusters).execute(target)).rejects.toBeInstanceOf(ClusterScopeError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('returns the persisted entity and propagates save failure while preserving the loaded state', async () => {
    const clusters = clusterRepository();
    const loaded = new Cluster(clusterState());
    const saved = new Cluster(clusterState({ name: 'Saved' }));
    const failure = new Error('Save failed');
    const update = new UpdateClusterUseCase(clusters);

    vi.mocked(clusters.findById).mockResolvedValue(loaded);
    vi.mocked(clusters.save).mockResolvedValueOnce(saved).mockRejectedValueOnce(failure);
    await expect(update.execute({ ...target, name: 'Updated' })).resolves.toBe(saved);
    await expect(update.execute({ ...target, name: 'Updated' })).rejects.toBe(failure);
    expect(loaded.toState()).toEqual(clusterState());
  });
});

describe('GetClusterUseCase', () => {
  it.each([ClusterStatus.ACTIVE, ClusterStatus.ARCHIVED])('returns a same-site %s cluster', async (status) => {
    const clusters = clusterRepository();
    const cluster = new Cluster(clusterState({ status }));

    vi.mocked(clusters.findById).mockResolvedValue(cluster);
    await expect(new GetClusterUseCase(clusters).execute(target)).resolves.toBe(cluster);
    expect(clusters.findById).toHaveBeenCalledExactlyOnceWith('cluster-1');
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('returns null when absent', async () => {
    await expect(new GetClusterUseCase(clusterRepository()).execute(target)).resolves.toBeNull();
  });

  it('rejects another site', async () => {
    const clusters = clusterRepository();

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState({ siteId: 'site-2' })));
    await expect(new GetClusterUseCase(clusters).execute(target)).rejects.toBeInstanceOf(ClusterScopeError);
  });
});

describe.each([GetClusterUseCase, UpdateClusterUseCase])('%s read failures', (UseCase) => {
  it('propagates lookup failure without writing', async () => {
    const clusters = clusterRepository();
    const failure = new Error('Read failed');

    vi.mocked(clusters.findById).mockRejectedValue(failure);
    await expect(new UseCase(clusters).execute(target)).rejects.toBe(failure);
    expect(clusters.save).not.toHaveBeenCalled();
  });
});

describe('ListClustersUseCase', () => {
  it('returns all results, including archived clusters, without truncation or implicit filters', async () => {
    const clusters = clusterRepository();
    const all = Array.from({ length: 150 }, (_, index) => new Cluster(clusterState({
      clusterId: `cluster-${index}`, status: index % 2 === 0 ? ClusterStatus.ACTIVE : ClusterStatus.ARCHIVED,
    })));

    vi.mocked(clusters.findBySite).mockResolvedValue(all);
    await expect(new ListClustersUseCase(clusters).execute({ siteId: 'site-1' })).resolves.toBe(all);
    expect(clusters.findBySite).toHaveBeenCalledExactlyOnceWith('site-1', undefined);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it.each<IClusterFilter>([
    {}, { parentClusterId: null },
    { parentClusterId: 'parent', language: 'en', status: ClusterStatus.ARCHIVED },
  ])('copies supported filters and preserves null parents: %j', async (filter) => {
    const clusters = clusterRepository();

    await expect(new ListClustersUseCase(clusters).execute({ siteId: 'site-1', filter })).resolves.toEqual([]);
    expect(clusters.findBySite).toHaveBeenCalledExactlyOnceWith('site-1', filter);
    expect(vi.mocked(clusters.findBySite).mock.calls[0]?.[1]).not.toBe(filter);
  });

  it('ignores extra filter fields so they cannot override site scope', async () => {
    const clusters = clusterRepository();
    const filter = { language: 'en', siteId: 'site-2', extra: true };

    await new ListClustersUseCase(clusters).execute({ siteId: 'site-1', filter });
    expect(clusters.findBySite).toHaveBeenCalledExactlyOnceWith('site-1', { language: 'en' });
  });

  it('rejects mixed-site results without returning partial data', async () => {
    const clusters = clusterRepository();

    vi.mocked(clusters.findBySite).mockResolvedValue([
      new Cluster(clusterState()), new Cluster(clusterState({ clusterId: 'cluster-2', siteId: 'site-2' })),
    ]);
    await expect(new ListClustersUseCase(clusters).execute({ siteId: 'site-1' }))
      .rejects.toBeInstanceOf(ClusterScopeError);
  });

  it('propagates repository failures', async () => {
    const clusters = clusterRepository();
    const failure = new Error('List failed');

    vi.mocked(clusters.findBySite).mockRejectedValue(failure);
    await expect(new ListClustersUseCase(clusters).execute({ siteId: 'site-1' })).rejects.toBe(failure);
  });
});
