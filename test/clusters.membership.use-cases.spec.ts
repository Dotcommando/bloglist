import {
  ClusterBlogPlacementScopeService,
} from '../src/app/services/clusters/cluster-blog-placement-scope.service.js';
import { ClusterScopeService } from '../src/app/services/clusters/cluster-scope.service.js';
import { AddBlogToClusterUseCase } from '../src/app/use-cases/clusters/add-blog-to-cluster.use-case.js';
import { ArchiveClusterUseCase } from '../src/app/use-cases/clusters/archive-cluster.use-case.js';
import { RemoveBlogFromClusterUseCase } from '../src/app/use-cases/clusters/remove-blog-from-cluster.use-case.js';
import {
  UpdateClusterBlogPlacementUseCase,
} from '../src/app/use-cases/clusters/update-cluster-blog-placement.use-case.js';
import { Cluster } from '../src/domain/clusters/cluster.js';
import { ClusterBlogPlacement } from '../src/domain/clusters/cluster-blog-placement.js';
import { ClusterConflictError } from '../src/domain/clusters/cluster-conflict.error.js';
import { ClusterNotFoundError } from '../src/domain/clusters/cluster-not-found.error.js';
import { ClusterScopeError } from '../src/domain/clusters/cluster-scope.error.js';
import { ClusterStatus } from '../src/domain/clusters/cluster-status.enum.js';
import type { IBlogLookupPort } from '../src/ports/outbound/clusters/blog-lookup.port.js';
import type { IClusterRepository } from '../src/ports/outbound/clusters/cluster.repository.js';
import type { IClusterBlogRepository } from '../src/ports/outbound/clusters/cluster-blog.repository.js';
import { blogLookup, clusterBlogRepository, clusterRepository } from './clusters.fixtures.js';
import { clusterState, instant, placementState } from './domain.fixtures.js';

const target = { siteId: 'site-1', clusterId: 'cluster-1' };

const placementTarget = { ...target, blogId: 'blog-1' };

interface IMembershipScenario {
  clusters: IClusterRepository;
  placements: IClusterBlogRepository;
  blogs: IBlogLookupPort;
  loaded: ClusterBlogPlacement;
  add: AddBlogToClusterUseCase;
  update: UpdateClusterBlogPlacementUseCase;
  remove: RemoveBlogFromClusterUseCase;
}

function scenario(placementExists = true): IMembershipScenario {
  const clusters = clusterRepository();
  const placements = clusterBlogRepository();
  const blogs = blogLookup();
  const scope = new ClusterScopeService(clusters);
  const placementScope = new ClusterBlogPlacementScopeService(scope, placements);
  const loaded = new ClusterBlogPlacement(placementState());

  vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState()));
  vi.mocked(placements.findByClusterAndBlog).mockResolvedValue(placementExists ? loaded : null);

  return {
    clusters,
    placements,
    blogs,
    loaded,
    add: new AddBlogToClusterUseCase(placements, blogs, scope, {
      nextPlacementId: (): string => 'placement-new', currentInstant: instant,
    }),
    update: new UpdateClusterBlogPlacementUseCase(placements, placementScope),
    remove: new RemoveBlogFromClusterUseCase(placements, placementScope),
  };
}

describe('AddBlogToClusterUseCase', () => {
  it('creates a visible placement with null notes and generated identity and UTC instants', async () => {
    const s = scenario(false);
    const saved = await s.add.execute({ ...placementTarget, position: 125.5 });

    expect(saved.toState()).toEqual(placementState({ clusterBlogPlacementId: 'placement-new' }));
    expect(s.blogs.exists).toHaveBeenCalledExactlyOnceWith('blog-1');
    expect(s.placements.findByClusterAndBlog).toHaveBeenCalledExactlyOnceWith('cluster-1', 'blog-1');
    expect(s.placements.save).toHaveBeenCalledExactlyOnceWith(saved);
    expect(s.clusters.save).not.toHaveBeenCalled();
  });

  it('preserves finite negative fractional positions, empty Markdown and explicit visibility=false', async () => {
    const s = scenario(false);
    const saved = await s.add.execute({ ...placementTarget, position: -12.5, notesMd: '', visible: false });

    expect(saved.toState()).toEqual(placementState({
      clusterBlogPlacementId: 'placement-new', position: -12.5, notesMd: '', visible: false,
    }));
  });

  it('rejects a missing catalog blog before looking up or saving the placement', async () => {
    const s = scenario(false);

    vi.mocked(s.blogs.exists).mockResolvedValue(false);
    await expect(s.add.execute({ ...placementTarget, position: 0 })).rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(s.placements.findByClusterAndBlog).not.toHaveBeenCalled();
    expect(s.placements.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate placement without overwriting its fields', async () => {
    const s = scenario();

    await expect(s.add.execute({ ...placementTarget, position: 0 })).rejects.toBeInstanceOf(ClusterConflictError);
    expect(s.placements.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(placementState());
  });

  it('returns the persisted entity and propagates concurrent duplicate rejection without retry', async () => {
    const s = scenario(false);
    const saved = new ClusterBlogPlacement(placementState({ clusterBlogPlacementId: 'placement-new' }));
    const failure = new ClusterConflictError('Concurrent duplicate');

    vi.mocked(s.placements.save).mockResolvedValueOnce(saved).mockRejectedValueOnce(failure);
    await expect(s.add.execute({ ...placementTarget, position: 0 })).resolves.toBe(saved);
    await expect(s.add.execute({ ...placementTarget, position: 0 })).rejects.toBe(failure);
    expect(s.placements.save).toHaveBeenCalledTimes(2);
  });

  it('propagates catalog lookup failure without writing', async () => {
    const s = scenario(false);
    const failure = new Error('Catalog unavailable');

    vi.mocked(s.blogs.exists).mockRejectedValue(failure);
    await expect(s.add.execute({ ...placementTarget, position: 0 })).rejects.toBe(failure);
    expect(s.placements.save).not.toHaveBeenCalled();
  });
});

describe('UpdateClusterBlogPlacementUseCase', () => {
  it('updates only position, notes and visibility on a detached entity', async () => {
    const s = scenario();
    const updated = await s.update.execute({
      ...placementTarget, position: -10.5, notesMd: '**Notes**', visible: false,
    });

    expect(updated.toState()).toEqual(placementState({ position: -10.5, notesMd: '**Notes**', visible: false }));
    expect(s.placements.save).toHaveBeenCalledExactlyOnceWith(updated);
    expect(s.loaded.toState()).toEqual(placementState());
    expect(s.blogs.exists).not.toHaveBeenCalled();
    expect(s.clusters.save).not.toHaveBeenCalled();
  });

  it('preserves omitted fields, clears notes with null and handles position=0 and visibility=true', async () => {
    const s = scenario();

    vi.mocked(s.placements.findByClusterAndBlog).mockResolvedValue(new ClusterBlogPlacement(placementState({
      notesMd: 'Notes', visible: false,
    })));
    const unchanged = await s.update.execute(placementTarget);
    const updated = await s.update.execute({ ...placementTarget, position: 0, notesMd: null, visible: true });

    expect(unchanged.toState()).toEqual(placementState({ notesMd: 'Notes', visible: false }));
    expect(updated.toState()).toEqual(placementState({ position: 0 }));
  });

  it('returns the saved entity and leaves the original intact if save fails', async () => {
    const s = scenario();
    const saved = new ClusterBlogPlacement(placementState({ visible: false }));
    const failure = new Error('Save failed');

    vi.mocked(s.placements.save).mockResolvedValueOnce(saved).mockRejectedValueOnce(failure);
    await expect(s.update.execute({ ...placementTarget, visible: false })).resolves.toBe(saved);
    await expect(s.update.execute({ ...placementTarget, visible: false })).rejects.toBe(failure);
    expect(s.loaded.toState()).toEqual(placementState());
  });
});

describe('RemoveBlogFromClusterUseCase', () => {
  it('removes only the owned cluster/blog pair and does not depend on catalog existence', async () => {
    const s = scenario();

    vi.mocked(s.blogs.exists).mockResolvedValue(false);
    await expect(s.remove.execute(placementTarget)).resolves.toBeUndefined();
    expect(s.placements.remove).toHaveBeenCalledExactlyOnceWith('cluster-1', 'blog-1');
    expect(s.blogs.exists).not.toHaveBeenCalled();
    expect(s.placements.save).not.toHaveBeenCalled();
    expect(s.clusters.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(placementState());
  });

  it('rejects repeated removal when the placement is already absent', async () => {
    const s = scenario();

    vi.mocked(s.placements.findByClusterAndBlog).mockResolvedValueOnce(s.loaded).mockResolvedValueOnce(null);
    await expect(s.remove.execute(placementTarget)).resolves.toBeUndefined();
    await expect(s.remove.execute(placementTarget)).rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(s.placements.remove).toHaveBeenCalledTimes(1);
  });

  it('propagates a concurrent removal failure without retrying', async () => {
    const s = scenario();
    const failure = new ClusterNotFoundError('Placement disappeared before removal');

    vi.mocked(s.placements.remove).mockRejectedValue(failure);
    await expect(s.remove.execute(placementTarget)).rejects.toBe(failure);
    expect(s.placements.remove).toHaveBeenCalledTimes(1);
  });
});

const placementOperations = [
  { name: 'add',
    execute: (s: IMembershipScenario): Promise<ClusterBlogPlacement> =>
      s.add.execute({ ...placementTarget, position: 0 }) },
  {
    name: 'update',
    execute: (s: IMembershipScenario): Promise<ClusterBlogPlacement> => s.update.execute(placementTarget),
  },
  { name: 'remove', execute: (s: IMembershipScenario): Promise<void> => s.remove.execute(placementTarget) },
];

describe.each(placementOperations)('$name site ownership preconditions', ({ execute }) => {
  it('rejects a missing cluster before accessing placements or the blog catalog', async () => {
    const s = scenario();

    vi.mocked(s.clusters.findById).mockResolvedValue(null);
    await expect(execute(s)).rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(s.placements.findByClusterAndBlog).not.toHaveBeenCalled();
    expect(s.blogs.exists).not.toHaveBeenCalled();
    expect(s.placements.save).not.toHaveBeenCalled();
    expect(s.placements.remove).not.toHaveBeenCalled();
  });

  it('rejects another site before accessing placements or the blog catalog', async () => {
    const s = scenario();

    vi.mocked(s.clusters.findById).mockResolvedValue(new Cluster(clusterState({ siteId: 'site-2' })));
    await expect(execute(s)).rejects.toBeInstanceOf(ClusterScopeError);
    expect(s.placements.findByClusterAndBlog).not.toHaveBeenCalled();
    expect(s.blogs.exists).not.toHaveBeenCalled();
    expect(s.placements.save).not.toHaveBeenCalled();
    expect(s.placements.remove).not.toHaveBeenCalled();
  });

  it('propagates cluster lookup failure without writes', async () => {
    const s = scenario();
    const failure = new Error('Cluster lookup failed');

    vi.mocked(s.clusters.findById).mockRejectedValue(failure);
    await expect(execute(s)).rejects.toBe(failure);
    expect(s.placements.save).not.toHaveBeenCalled();
    expect(s.placements.remove).not.toHaveBeenCalled();
  });
});

describe.each([
  {
    name: 'update',
    execute: (s: IMembershipScenario): Promise<ClusterBlogPlacement> => s.update.execute(placementTarget),
  },
  { name: 'remove', execute: (s: IMembershipScenario): Promise<void> => s.remove.execute(placementTarget) },
])('$name placement validation', ({ execute }) => {
  it('rejects an absent placement instead of reporting partial success', async () => {
    const s = scenario(false);

    await expect(execute(s)).rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(s.placements.save).not.toHaveBeenCalled();
    expect(s.placements.remove).not.toHaveBeenCalled();
  });

  it.each([{ clusterId: 'other-cluster' }, { blogId: 'other-blog' }])(
    'rejects an incorrectly associated placement: %j', async (overrides) => {
      const s = scenario();
      const placement = new ClusterBlogPlacement(placementState(overrides));

      vi.mocked(s.placements.findByClusterAndBlog).mockResolvedValue(placement);
      await expect(execute(s)).rejects.toBeInstanceOf(RangeError);
      expect(s.placements.save).not.toHaveBeenCalled();
      expect(s.placements.remove).not.toHaveBeenCalled();
    });

  it('propagates placement lookup failure without writes', async () => {
    const s = scenario();
    const failure = new Error('Placement lookup failed');

    vi.mocked(s.placements.findByClusterAndBlog).mockRejectedValue(failure);
    await expect(execute(s)).rejects.toBe(failure);
    expect(s.placements.save).not.toHaveBeenCalled();
    expect(s.placements.remove).not.toHaveBeenCalled();
  });
});

describe.each(['add', 'update'])('%s placement domain invariants', (operation) => {
  it.each([NaN, Infinity, -Infinity])('rejects non-finite position %s without saving', async (position) => {
    const s = scenario(operation === 'update');
    const result = operation === 'add'
      ? s.add.execute({ ...placementTarget, position })
      : s.update.execute({ ...placementTarget, position });

    await expect(result).rejects.toBeInstanceOf(RangeError);
    expect(s.placements.save).not.toHaveBeenCalled();
    expect(s.loaded.toState()).toEqual(placementState());
  });
});

describe('ArchiveClusterUseCase', () => {
  it.each([ClusterStatus.ACTIVE, ClusterStatus.ARCHIVED])('archives a %s cluster preserving all other fields',
    async (status) => {
      const clusters = clusterRepository();
      const state = clusterState({ status, parentClusterId: 'parent', primaryQuery: 'query' });
      const loaded = new Cluster(state);

      vi.mocked(clusters.findById).mockResolvedValue(loaded);
      const saved = await new ArchiveClusterUseCase(clusters, new ClusterScopeService(clusters)).execute(target);

      expect(saved.toState()).toEqual({ ...state, status: ClusterStatus.ARCHIVED });
      expect(clusters.save).toHaveBeenCalledExactlyOnceWith(saved);
      expect(loaded.toState()).toEqual(state);
    });

  it('rejects a missing cluster without writing', async () => {
    const clusters = clusterRepository();

    await expect(new ArchiveClusterUseCase(clusters, new ClusterScopeService(clusters)).execute(target))
      .rejects.toBeInstanceOf(ClusterNotFoundError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('rejects another site without writing', async () => {
    const clusters = clusterRepository();

    vi.mocked(clusters.findById).mockResolvedValue(new Cluster(clusterState({ siteId: 'site-2' })));
    await expect(new ArchiveClusterUseCase(clusters, new ClusterScopeService(clusters)).execute(target))
      .rejects.toBeInstanceOf(ClusterScopeError);
    expect(clusters.save).not.toHaveBeenCalled();
  });

  it('returns the saved entity and propagates save failure while preserving the loaded instance', async () => {
    const clusters = clusterRepository();
    const loaded = new Cluster(clusterState());
    const saved = new Cluster(clusterState({ status: ClusterStatus.ARCHIVED }));
    const failure = new Error('Save failed');
    const archive = new ArchiveClusterUseCase(clusters, new ClusterScopeService(clusters));

    vi.mocked(clusters.findById).mockResolvedValue(loaded);
    vi.mocked(clusters.save).mockResolvedValueOnce(saved).mockRejectedValueOnce(failure);
    await expect(archive.execute(target)).resolves.toBe(saved);
    await expect(archive.execute(target)).rejects.toBe(failure);
    expect(loaded.toState()).toEqual(clusterState());
  });
});
