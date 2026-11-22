import { FindPublishedPagesUseCase } from '../../../src/app/use-cases/publication/find-published-pages.use-case.js';

function setup(): {
  operation: FindPublishedPagesUseCase;
  getActive: ReturnType<typeof vi.fn<() => Promise<{
    siteId: string; releaseId: string; activatedAt: Date;
  } | null>>>;
  readPublishedPageIds: ReturnType<typeof vi.fn<() => Promise<readonly string[] | null>>>;
} {
  const getActive = vi.fn(async (): Promise<{ siteId: string; releaseId: string; activatedAt: Date } | null> =>
    ({ siteId: 'site', releaseId: 'release', activatedAt: new Date(0) }));
  const readPublishedPageIds = vi.fn(async (): Promise<readonly string[] | null> => ['p1', 'p2']);
  const operation = new FindPublishedPagesUseCase({ getActive, activate: vi.fn(), findActivation: vi.fn() },
    { readPublishedPageIds });

  return { operation, getActive, readPublishedPageIds };
}

it('checks a page batch against one captured verified catalog', async () => {
  const s = setup();

  expect(await s.operation.execute({ siteId: 'site', pageIds: ['p2', 'draft', 'p1'] })).toEqual(['p2', 'p1']);
  expect(s.getActive).toHaveBeenCalledExactlyOnceWith('site');
  expect(s.readPublishedPageIds).toHaveBeenCalledExactlyOnceWith('site', 'release');
  expect(await s.operation.execute({ siteId: 'site', pageIds: [] })).toEqual([]);
  expect(s.getActive).toHaveBeenCalledOnce();
  s.getActive.mockResolvedValueOnce({ siteId: 'site', releaseId: 'next', activatedAt: new Date(1) });
  expect(await s.operation.execute({ siteId: 'site', pageIds: ['p1'] })).toEqual(['p1']);
  expect(s.readPublishedPageIds).toHaveBeenLastCalledWith('site', 'next');
});

it('rejects invalid batches, foreign pointers and unavailable catalogs', async () => {
  const s = setup();

  for (const pageIds of [['p1', 'p1'], [''], Array.from({ length: 129 }, (_, i) => 'p' + i)]) {
    await expect(s.operation.execute({ siteId: 'site', pageIds })).rejects.toThrow();
  }
  expect(s.getActive).not.toHaveBeenCalled();
  s.getActive.mockResolvedValueOnce({ siteId: 'foreign', releaseId: 'release', activatedAt: new Date(0) });
  await expect(s.operation.execute({ siteId: 'site', pageIds: ['p1'] })).rejects.toThrow();
  expect(s.readPublishedPageIds).not.toHaveBeenCalled();
  s.readPublishedPageIds.mockResolvedValueOnce(null);
  await expect(s.operation.execute({ siteId: 'site', pageIds: ['p1'] })).rejects.toThrow();
  s.getActive.mockResolvedValueOnce(null);
  expect(await s.operation.execute({ siteId: 'site', pageIds: ['p1'] })).toEqual([]);
  s.readPublishedPageIds.mockRejectedValueOnce(new Error('catalog unavailable'));
  await expect(s.operation.execute({ siteId: 'site', pageIds: ['p1'] })).rejects.toThrow('catalog unavailable');
});
