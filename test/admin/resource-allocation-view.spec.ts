import { resourceAllocationPreview } from '../../admin/src/features/resources/resource-allocation-view.js';

const saved = {
  capacity: 20,
  infrastructureCpu: 0,
  databaseCpu: 2,
  cmsCpu: 18,
  cmsCpuBudget: null,
  managed: true,
  sites: [{ siteId: 'a', processes: 3, running: 3 }],
};

it('separates edited, saved and running processes from the shared CPU quota', () => {
  const result = resourceAllocationPreview(saved, 2, { a: 22 }, 'a');

  expect(result).toMatchObject({
    total: 22,
    savedTotal: 3,
    runningTotal: 3,
    cmsCpu: 18,
    recommendation: 18,
    unallocated: 0,
    aboveRecommendation: true,
  });
});

it('chooses the dump mode by site process count regardless of unused CPU', () => {
  expect(resourceAllocationPreview({ ...saved, capacity: 3 }, 1.2, { a: 1 }, 'a')).toMatchObject({
    unallocated: 0.8, dumpMode: 'InProcess',
  });
  expect(resourceAllocationPreview(saved, 2, { a: 2 }, 'a')).toMatchObject({
    unallocated: 16, dumpMode: 'BorrowedProcess',
  });
});

it('keeps CPU overcommit advisory without a memory or connection process cap', () => {
  const result = resourceAllocationPreview(saved, 2, { a: 22 }, 'a');

  expect(result.aboveRecommendation).toBe(true);
  expect(result).not.toHaveProperty('aboveProcessLimit');
});
