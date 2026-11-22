import { type IResourceProcess, ResourceProcessRole } from './resources-api.js';

interface IResourceProcessSummary {
  readonly total: number;
  readonly sites: number;
  readonly services: number;
  readonly dumps: number;
  readonly pending: number;
}

export function resourceProcessSummary(processes: readonly IResourceProcess[]): IResourceProcessSummary {
  let sites = 0;
  let services = 0;
  let dumps = 0;
  let pending = 0;

  for (const process of processes) {
    if (process.pid === null) {
      pending++;
    } else if (process.role === ResourceProcessRole.Site) {
      sites++;
    } else if (process.role === ResourceProcessRole.Dump) {
      dumps++;
    } else {
      services++;
    }
  }

  return { total: sites + services + dumps, sites, services, dumps, pending };
}
