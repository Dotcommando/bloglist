import { resourceProcessSummary } from '../../admin/src/features/resources/resource-process-summary.js';
import {
  type IResourceProcess, ResourceProcessRole, ResourceProcessState,
} from '../../admin/src/features/resources/resources-api.js';

describe('CMS process totals', () => {
  const process = (
    pid: number | null, role: ResourceProcessRole, state = ResourceProcessState.Ready,
  ): IResourceProcess => ({
    pid, role, state, siteId: role === ResourceProcessRole.Site ? 'site' : null,
  });

  it('explains three CMS processes as one site and two service processes', () => {
    expect(resourceProcessSummary([
      process(100, ResourceProcessRole.Coordinator),
      process(101, ResourceProcessRole.Administration),
      process(102, ResourceProcessRole.Site),
    ])).toEqual({ total: 3, sites: 1, services: 2, dumps: 0, pending: 0 });
  });

  it('counts live replacement and dump PIDs and separates workers without a PID', () => {
    expect(resourceProcessSummary([
      process(100, ResourceProcessRole.Coordinator),
      process(101, ResourceProcessRole.Administration),
      process(102, ResourceProcessRole.Site, ResourceProcessState.Draining),
      process(103, ResourceProcessRole.Site),
      process(104, ResourceProcessRole.Dump),
      process(null, ResourceProcessRole.Site, ResourceProcessState.Starting),
    ])).toEqual({ total: 5, sites: 2, services: 2, dumps: 1, pending: 1 });
  });
});
