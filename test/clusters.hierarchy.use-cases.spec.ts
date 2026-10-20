import { ClusterScopeService } from '../src/app/services/clusters/cluster-scope.service.js';
import { MoveClusterUseCase } from '../src/app/use-cases/clusters/move-cluster.use-case.js';
import { ReorderClusterBlogsUseCase } from '../src/app/use-cases/clusters/reorder-cluster-blogs.use-case.js';
import { Cluster } from '../src/domain/clusters/cluster.js';
import { ClusterBlogPlacement } from '../src/domain/clusters/cluster-blog-placement.js';
import { ClusterConflictError } from '../src/domain/clusters/cluster-conflict.error.js';
import { ClusterNotFoundError } from '../src/domain/clusters/cluster-not-found.error.js';
import { ClusterScopeError } from '../src/domain/clusters/cluster-scope.error.js';
import { ClusterStatus } from '../src/domain/clusters/cluster-status.enum.js';
import type { IReorderClusterBlogsInput } from '../src/ports/inbound/clusters/reorder-cluster-blogs.port.js';
import type { IClusterRepository } from '../src/ports/outbound/clusters/cluster.repository.js';
import { clusterBlogRepository, clusterRepository } from './clusters.fixtures.js';
import { clusterState, placementState } from './domain.fixtures.js';

const target = { siteId: 'site-1', clusterId: 'cluster-1' };

interface IHierarchyScenario {
  clusters: IClusterRepository;
  nodes: Map<string, Cluster>;
  loaded: Cluster;
  move: MoveClusterUseCase;
}

function hierarchy(): IHierarchyScenario {
  const clusters = clusterRepository();
  const loaded = new Cluster(clusterState({ parentClusterId: 'old-parent' }));
  const nodes = new Map([
    [loaded.clusterId, loaded],
    ['parent', new Cluster(clusterState({ clusterId: 'parent', parentClusterId: 'root' }))],
    ['root', new Cluster(clusterState({ clusterId: 'root' }))],
  ]);

  vi.mocked(clusters.findById).mockImplementation(async (id) => nodes.get(id) ?? null);

  return { clusters, nodes, loaded, move: new MoveClusterUseCase(clusters, new ClusterScopeService(clusters)) };
}

describe('MoveClusterUseCase', () => {
  it('walks ancestors and submits one atomic move with the original expected state', async () => {
    const s = hierarchy();
    const expected = s.loaded.toState();
    const saved = new Cluster(clusterState({ parentClusterId: 'parent', updatedAt: new Date('2026-02-01T00:00:00Z') }));

    vi.mocked(s.clusters.move).mockResolvedValue(saved);
    await expect(s.move.execute({ ...target, parentClusterId: 'parent' })).resolves.toBe(saved);
    expect(s.clusters.findById).toHaveBeenCalledTimes(3);
    expect(vi.mocked(s.clusters.findById).mock.calls.map(([id]) => id)).toEqual(['cluster-1', 'parent', 'root']);
    expect(s.clusters.move).toHaveBeenCalledExactlyOnceWith({ expectedCluster: expected, parentClusterId: 'parent' });
    expect(s.clusters.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(expected);
  });

  it.each([ClusterStatus.ACTIVE, ClusterStatus.ARCHIVED])('moves a %s cluster to root', async (status) => {
    const s = hierarchy();
    const state = clusterState({ status, parentClusterId: 'old-parent' });
    const loaded = new Cluster(state);
    const saved = new Cluster({ ...state, parentClusterId: null });

    s.nodes.set('cluster-1', loaded);
    vi.mocked(s.clusters.move).mockResolvedValue(saved);
    await expect(s.move.execute({ ...target, parentClusterId: null })).resolves.toBe(saved);
    expect(s.clusters.findById).toHaveBeenCalledExactlyOnceWith('cluster-1');
    expect(loaded.toState()).toEqual(state);
    expect(s.clusters.save).not.toHaveBeenCalled();
  });

  it.each(['cluster-1', ' '])('rejects invalid direct parent %j before a hierarchy write', async (parentClusterId) => {
    const s = hierarchy();

    await expect(s.move.execute({ ...target, parentClusterId })).rejects.toBeInstanceOf(RangeError);
    expect(s.clusters.move).not.toHaveBeenCalled();
    expect(s.clusters.save).not.toHaveBeenCalled();
  });

  it('rejects a descendant as parent', async () => {
    const s = hierarchy();

    s.nodes.set('parent', new Cluster(clusterState({ clusterId: 'parent', parentClusterId: 'cluster-1' })));
    await expect(s.move.execute({ ...target, parentClusterId: 'parent' })).rejects.toBeInstanceOf(RangeError);
    expect(s.clusters.move).not.toHaveBeenCalled();
    expect(s.loaded.parentClusterId).toBe('old-parent');
  });

  it('rejects an existing cycle in the prospective ancestor chain without looping indefinitely', async () => {
    const s = hierarchy();

    s.nodes.set('root', new Cluster(clusterState({ clusterId: 'root', parentClusterId: 'parent' })));
    await expect(s.move.execute({ ...target, parentClusterId: 'parent' })).rejects.toBeInstanceOf(RangeError);
    expect(s.clusters.findById).toHaveBeenCalledTimes(3);
    expect(s.clusters.move).not.toHaveBeenCalled();
  });

  it.each(['parent', 'root'])('rejects missing ancestor %s', async (id) => {
    const s = hierarchy();

    s.nodes.delete(id);
    await expect(s.move.execute({ ...target, parentClusterId: 'parent' })).rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(s.clusters.move).not.toHaveBeenCalled();
  });

  it.each(['parent', 'root'])('rejects out-of-site ancestor %s', async (id) => {
    const s = hierarchy();

    s.nodes.set(id, new Cluster(clusterState({ clusterId: id, siteId: 'site-2' })));
    await expect(s.move.execute({ ...target, parentClusterId: 'parent' })).rejects.toBeInstanceOf(ClusterScopeError);
    expect(s.clusters.move).not.toHaveBeenCalled();
  });

  it.each(['parent', 'root'])('rejects ancestor %s using another language', async (id) => {
    const s = hierarchy();

    s.nodes.set(id, new Cluster(clusterState({ clusterId: id, language: 'de' })));
    await expect(s.move.execute({ ...target, parentClusterId: 'parent' })).rejects.toBeInstanceOf(RangeError);
    expect(s.clusters.move).not.toHaveBeenCalled();
  });

  it('rejects missing and out-of-site source clusters', async () => {
    const s = hierarchy();

    s.nodes.delete('cluster-1');
    await expect(s.move.execute({ ...target, parentClusterId: null })).rejects.toBeInstanceOf(ClusterNotFoundError);
    s.nodes.set('cluster-1', new Cluster(clusterState({ siteId: 'site-2' })));
    await expect(s.move.execute({ ...target, parentClusterId: null })).rejects.toBeInstanceOf(ClusterScopeError);
    expect(s.clusters.move).not.toHaveBeenCalled();
  });

  it('propagates stale-state rejection without retrying or changing the loaded cluster', async () => {
    const s = hierarchy();
    const expected = s.loaded.toState();
    const failure = new ClusterConflictError('Stale cluster state');

    vi.mocked(s.clusters.move).mockRejectedValue(failure);
    await expect(s.move.execute({ ...target, parentClusterId: 'parent' })).rejects.toBe(failure);
    expect(s.clusters.move).toHaveBeenCalledTimes(1);
    expect(s.clusters.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(expected);
  });

  it('propagates an ancestor lookup failure without writing', async () => {
    const s = hierarchy();
    const failure = new Error('Ancestor lookup unavailable');

    vi.mocked(s.clusters.findById).mockResolvedValueOnce(s.loaded).mockRejectedValueOnce(failure);
    await expect(s.move.execute({ ...target, parentClusterId: 'parent' })).rejects.toBe(failure);
    expect(s.clusters.move).not.toHaveBeenCalled();
  });
});

describe('ReorderClusterBlogsUseCase', () => {
  it('submits one partial atomic update preserving input order, tied positions and loaded data', async () => {
    const clusters = clusterRepository();
    const placements = clusterBlogRepository();
    const loaded = new ClusterBlogPlacement(placementState({ visible: false, notesMd: 'Notes' }));
    const other = new ClusterBlogPlacement(placementState({ blogId: 'blog-2', clusterBlogPlacementId: 'placement-2' }));
    const input: IReorderClusterBlogsInput = {
      ...target, positions: [{ blogId: 'blog-2', position: -10.5 }, { blogId: 'blog-1', position: -10.5 }],
    };

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
    vi.mocked(placements.findByClusterAndBlog).mockResolvedValueOnce(other).mockResolvedValueOnce(loaded);
    await expect(new ReorderClusterBlogsUseCase(placements, new ClusterScopeService(clusters)).execute(input))
      .resolves.toBeUndefined();
    expect(placements.updatePositions).toHaveBeenCalledExactlyOnceWith('cluster-1', input.positions);
    expect(vi.mocked(placements.updatePositions).mock.calls[0]?.[1]).not.toBe(input.positions);
    expect(vi.mocked(placements.updatePositions).mock.calls[0]?.[1][0]).not.toBe(input.positions[0]);
    expect(placements.findByCluster).not.toHaveBeenCalled();
    expect(placements.save).not.toHaveBeenCalled();
    expect(placements.remove).not.toHaveBeenCalled();
    expect(loaded.toState()).toEqual(placementState({ visible: false, notesMd: 'Notes' }));
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('treats an empty list as no changes after checking the cluster site', async () => {
    const clusters = clusterRepository();
    const placements = clusterBlogRepository();

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
    await expect(new ReorderClusterBlogsUseCase(placements, new ClusterScopeService(clusters))
      .execute({ ...target, positions: [] })).resolves.toBeUndefined();
    expect(clusters.findById).toHaveBeenCalledExactlyOnceWith('cluster-1');
    expect(placements.findByClusterAndBlog).not.toHaveBeenCalled();
    expect(placements.updatePositions).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -Infinity, '1'])('rejects non-finite or nonnumeric position %j before placement reads',
    async (position) => {
      const clusters = clusterRepository();
      const placements = clusterBlogRepository();
      const entry = { blogId: 'blog-1', position: 0 };

      Object.assign(entry, { position });
      vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
      await expect(new ReorderClusterBlogsUseCase(placements, new ClusterScopeService(clusters))
        .execute({ ...target, positions: [entry] })).rejects.toBeInstanceOf(RangeError);
      expect(placements.findByClusterAndBlog).not.toHaveBeenCalled();
      expect(placements.updatePositions).not.toHaveBeenCalled();
    });

  it.each([
    { positions: [{ blogId: ' ', position: 0 }] },
    { positions: [{ blogId: 'blog-1', position: 0 }, { blogId: 'blog-1', position: 1 }] },
  ])('rejects invalid identities or duplicate blog IDs: %j', async ({ positions }) => {
    const clusters = clusterRepository();
    const placements = clusterBlogRepository();

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
    await expect(new ReorderClusterBlogsUseCase(placements, new ClusterScopeService(clusters))
      .execute({ ...target, positions })).rejects.toBeInstanceOf(RangeError);
    expect(placements.findByClusterAndBlog).not.toHaveBeenCalled();
    expect(placements.updatePositions).not.toHaveBeenCalled();
  });

  it('rejects a missing placement without writing positions for the valid entries', async () => {
    const clusters = clusterRepository();
    const placements = clusterBlogRepository();

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
    vi.mocked(placements.findByClusterAndBlog).mockResolvedValueOnce(new ClusterBlogPlacement(placementState()));
    await expect(new ReorderClusterBlogsUseCase(placements, new ClusterScopeService(clusters)).execute({
      ...target, positions: [{ blogId: 'blog-1', position: 0 }, { blogId: 'missing', position: 1 }],
    })).rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(placements.updatePositions).not.toHaveBeenCalled();
    expect(placements.save).not.toHaveBeenCalled();
  });

  it.each([{ clusterId: 'other' }, { blogId: 'other' }])('rejects mismatched placement: %j', async (overrides) => {
    const clusters = clusterRepository();
    const placements = clusterBlogRepository();

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
    vi.mocked(placements.findByClusterAndBlog)
      .mockResolvedValue(new ClusterBlogPlacement(placementState(overrides)));
    await expect(new ReorderClusterBlogsUseCase(placements, new ClusterScopeService(clusters)).execute({
      ...target, positions: [{ blogId: 'blog-1', position: 0 }],
    })).rejects.toBeInstanceOf(RangeError);
    expect(placements.updatePositions).not.toHaveBeenCalled();
  });

  it('rejects missing or out-of-site clusters even for an empty list', async () => {
    const clusters = clusterRepository();
    const placements = clusterBlogRepository();
    const reorder = new ReorderClusterBlogsUseCase(placements, new ClusterScopeService(clusters));

    await expect(reorder.execute({ ...target, positions: [] })).rejects.toBeInstanceOf(ClusterNotFoundError);
    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState({ siteId: 'site-2' })));
    await expect(reorder.execute({ ...target, positions: [] })).rejects.toBeInstanceOf(ClusterScopeError);
    expect(placements.findByClusterAndBlog).not.toHaveBeenCalled();
    expect(placements.updatePositions).not.toHaveBeenCalled();
  });

  it('propagates concurrent membership rejection of the atomic update without retries', async () => {
    const clusters = clusterRepository();
    const placements = clusterBlogRepository();
    const failure = new ClusterNotFoundError('Placement removed before commit');

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
    vi.mocked(placements.findByClusterAndBlog).mockResolvedValue(new ClusterBlogPlacement(placementState()));
    vi.mocked(placements.updatePositions).mockRejectedValue(failure);
    await expect(new ReorderClusterBlogsUseCase(placements, new ClusterScopeService(clusters)).execute({
      ...target, positions: [{ blogId: 'blog-1', position: 0 }],
    })).rejects.toBe(failure);
    expect(placements.updatePositions).toHaveBeenCalledTimes(1);
    expect(placements.save).not.toHaveBeenCalled();
  });

  it('propagates placement lookup failure without writes', async () => {
    const clusters = clusterRepository();
    const placements = clusterBlogRepository();
    const failure = new Error('Placement lookup failed');

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
    vi.mocked(placements.findByClusterAndBlog).mockRejectedValue(failure);
    await expect(new ReorderClusterBlogsUseCase(placements, new ClusterScopeService(clusters)).execute({
      ...target, positions: [{ blogId: 'blog-1', position: 0 }],
    })).rejects.toBe(failure);
    expect(placements.updatePositions).not.toHaveBeenCalled();
  });
});
