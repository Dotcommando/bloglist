import {
  VerifiedPublicationCatalogAdapter,
} from '../../src/adapters/outbound/publication/memory/verified-publication-catalog.adapter.js';
import { type IPublicationReleaseState, ReleaseState } from '../../src/domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';

function release(siteId = 's', releaseId = 'r', pageId = 'page'): IPublicationReleaseState {
  return {
    siteId,
    releaseId,
    state: ReleaseState.Ready,
    createdAt: new Date(0),
    completedAt: new Date(0),
    failure: null,
    manifest: {
      artifacts: [],
      routes: [
        { kind: PublishedRouteKind.Static, urlId: 'u', path: '/', pageId, documentPath: 'index.html' },
        { kind: PublishedRouteKind.Redirect, urlId: 'old', path: '/old/', targetUrlId: 'u', status: 308 },
      ],
    },
  };
}

it('verifies once, detaches results and separates sites and release namespaces', async () => {
  const read = vi.fn(async (s: string, r: string) => release(s, r));
  const catalog = new VerifiedPublicationCatalogAdapter({ read });
  const first = await catalog.readPublishedPageIds('s', 'r');

  Object.assign(first!, ['mutated']);
  expect(await catalog.readPublishedPageIds('s', 'r')).toEqual(['page']);
  expect(read).toHaveBeenCalledExactlyOnceWith('s', 'r');
  await catalog.readPublishedPageIds('other', 'r');
  await catalog.readPublishedPageIds('s', 'next');
  expect(read).toHaveBeenCalledTimes(3);
  expect(catalog.snapshot()).toMatchObject({ hits: 1, misses: 3, entries: 3 });
});

it('rejects foreign and nonready metadata and retries failed or missing reads', async () => {
  const read = vi.fn(async (): Promise<IPublicationReleaseState | null> => null);
  const catalog = new VerifiedPublicationCatalogAdapter({ read });

  for (const invalid of [release('foreign'), release('s', 'foreign'), { ...release(), state: ReleaseState.Failed }]) {
    read.mockResolvedValueOnce(invalid);
    await expect(catalog.readPublishedPageIds('s', 'r')).rejects.toThrow();
  }
  read.mockRejectedValueOnce(new Error('integrity'));
  await expect(catalog.readPublishedPageIds('s', 'r')).rejects.toThrow('integrity');
  expect(await catalog.readPublishedPageIds('s', 'r')).toBeNull();
  read.mockResolvedValueOnce(release());
  expect(await catalog.readPublishedPageIds('s', 'r')).toEqual(['page']);
  expect(read).toHaveBeenCalledTimes(6);
});

it('bounds retention, returns oversized catalogs completely and reports eviction and refusal', async () => {
  const read = vi.fn(async (s: string, r: string) => release(s, r, r === 'large' ? 'x'.repeat(10000) : 'page'));
  const catalog = new VerifiedPublicationCatalogAdapter({ read }, { maxEntries: 1, maxBytes: 4096 });

  await catalog.readPublishedPageIds('s', 'r');
  await catalog.readPublishedPageIds('s', 'next');
  expect((await catalog.readPublishedPageIds('s', 'large'))![0]).toHaveLength(10000);
  await catalog.readPublishedPageIds('s', 'large');
  expect(catalog.snapshot()).toMatchObject({ entries: 1, evictions: 1, refusals: 2 });
  expect(catalog.snapshot().bytes).toBeLessThanOrEqual(4096);
});

it('coalesces reads and fences pending work across restoration and shutdown', async () => {
  let complete!: (value: IPublicationReleaseState) => void;
  const read = vi.fn(() => new Promise<IPublicationReleaseState>((resolve) => {
    complete = resolve;
  }));
  const catalog = new VerifiedPublicationCatalogAdapter({ read });
  const first = catalog.readPublishedPageIds('s', 'r');
  const second = catalog.readPublishedPageIds('s', 'r');

  await Promise.resolve();
  expect(read).toHaveBeenCalledOnce();
  catalog.purge();
  read.mockResolvedValueOnce(release('s', 'r', 'restored'));
  expect(await catalog.readPublishedPageIds('s', 'r')).toEqual(['restored']);
  complete(release());
  await Promise.all([first, second]);
  expect(await catalog.readPublishedPageIds('s', 'r')).toEqual(['restored']);
  catalog.onModuleDestroy();
  expect(catalog.snapshot()).toMatchObject({ entries: 0, pending: 0, bytes: 0 });
  await expect(catalog.readPublishedPageIds('s', 'r')).rejects.toThrow();
});

it('rejects excess pending catalog identities and observes all failing siblings', async () => {
  const failures: ((error: Error) => void)[] = [];
  const catalog = new VerifiedPublicationCatalogAdapter({
    read: () => new Promise((_resolve, reject) => {
      failures.push(reject);
    }),
  });
  const admitted = Array.from({ length: 128 }, (_, i) => catalog.readPublishedPageIds('s', String(i)));
  const outcomes = Promise.allSettled(admitted);

  await expect(catalog.readPublishedPageIds('s', 'excess')).rejects.toThrow();
  catalog.purge();
  await expect(catalog.readPublishedPageIds('s', 'after-purge')).rejects.toThrow();
  failures.forEach((reject) => reject(new Error('failed')));
  expect((await outcomes).every((outcome) => outcome.status === 'rejected')).toBe(true);
  expect(catalog.snapshot()).toMatchObject({ pending: 0, refusals: 2 });
});
