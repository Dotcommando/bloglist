import { describe, expect, it } from 'vitest';

import { DumpExecutionMode, resolveDumpExecution } from '../../src/domain/resources/site-process-allocation.js';

describe('owner-approved dump allocation', () => {
  it.each([
    [1, 1, [1], 0, DumpExecutionMode.InProcess],
    [2, 1, [1], 0, DumpExecutionMode.InProcess],
    [3, 1, [1], 0, DumpExecutionMode.InProcess],
    [6, 2.4, [1, 2], 0, DumpExecutionMode.InProcess],
    [6, 2.4, [1, 2], 1, DumpExecutionMode.BorrowedProcess],
    [6, 3, [1, 2], 0, DumpExecutionMode.InProcess],
    [6, 3, [1, 2], 1, DumpExecutionMode.BorrowedProcess],
    [6, 2.9, [1, 2], 0, DumpExecutionMode.InProcess],
    [2, 1, [1, 1, 1], 0, DumpExecutionMode.InProcess],
  ] as const)('capacity %s, DB %s, sites %j, target %s => %s',
    (capacity, databaseCpu, counts, target, mode) => {
      expect(resolveDumpExecution({
        capacity,
        databaseCpu,
        infrastructureCpu: 0,
        sites: counts.map((processes, index) => ({ siteId: String(index), processes })),
      }, String(target))).toBe(mode);
    });

  it('subtracts explicit infrastructure headroom without rounding the remainder', () => {
    expect(resolveDumpExecution({
      capacity: 3,
      databaseCpu: 1,
      infrastructureCpu: 1,
      sites: [{ siteId: 'a', processes: 1 }],
    }, 'a')).toBe(DumpExecutionMode.InProcess);
  });

  it('rejects missing sites and zero processes instead of inventing capacity', () => {
    expect(() => resolveDumpExecution({
      capacity: 3,
      databaseCpu: 1,
      infrastructureCpu: 0,
      sites: [{ siteId: 'a', processes: 0 }],
    }, 'a')).toThrow();
    expect(() => resolveDumpExecution({
      capacity: 3,
      databaseCpu: 1,
      infrastructureCpu: 0,
      sites: [{ siteId: 'a', processes: 1 }],
    }, 'other')).toThrow();
  });

  it('does not advertise host CPU capacity that is outside the effective CMS ceiling', () => {
    const value = {
      capacity: 20,
      databaseCpu: 1,
      infrastructureCpu: 0,
      sites: [{ siteId: 'a', processes: 1 }, { siteId: 'b', processes: 1 }],
    };

    expect(resolveDumpExecution({ ...value, cmsCpuBudget: 2 }, 'a')).toBe(DumpExecutionMode.InProcess);
    expect(resolveDumpExecution({ ...value, cmsCpuBudget: 2.1 }, 'a')).toBe(DumpExecutionMode.InProcess);
  });
});
