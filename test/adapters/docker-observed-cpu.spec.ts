import { expect, it } from 'vitest';

import { observedContainerCpu } from '../../src/adapters/outbound/runtime/docker/docker-engine-resource.boundary.js';

it('preserves fractional quota and also accounts for a narrower CPU affinity', () => {
  expect(observedContainerCpu({ NanoCpus: 2600000000, CpusetCpus: '0-5' })).toBe(2.6);
  expect(observedContainerCpu({ NanoCpus: 6000000000, CpusetCpus: '0,2' })).toBe(2);
  expect(observedContainerCpu({ CpuQuota: 260000, CpuPeriod: 100000, CpusetCpus: '' })).toBe(2.6);
  expect(observedContainerCpu({ NanoCpus: 0, CpusetCpus: '0-2,2-4,7' })).toBe(6);
  expect(observedContainerCpu({ NanoCpus: 0, CpusetCpus: '' })).toBeNull();
});

it('rejects invalid or unbounded affinity rather than advertising invented capacity', () => {
  expect(() => observedContainerCpu({ CpusetCpus: '3-1' })).toThrow();
  expect(() => observedContainerCpu({ CpusetCpus: '0-bad' })).toThrow();
});
