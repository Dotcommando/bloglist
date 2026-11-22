import { ContentRequestError, object, string } from '../../shared/api/content-api.js';

export enum ResourceDatabasePlacement {
  ManagedLocal = 'ManagedLocal',
  UnmanagedLocal = 'UnmanagedLocal',
  Remote = 'Remote',
}

import type { ICalibrationSiteAddon } from '../calibration/calibration-addon.types.js';

export interface IResourceSite {
  readonly addons?: readonly ICalibrationSiteAddon[];
  readonly siteId: string;
  readonly name: string;
  readonly domain: string;
  readonly processes: number;
  readonly running: number;
  readonly error: string | null;
  readonly dumpMode: string;
}

export enum ResourceProcessRole {
  Coordinator = 'Coordinator',
  Administration = 'Administration',
  Site = 'Site',
  Dump = 'Dump',
}

export enum ResourceProcessState {
  Starting = 'Starting',
  Ready = 'Ready',
  Draining = 'Draining',
}

export interface IResourceProcess {
  readonly pid: number | null;
  readonly siteId: string | null;
  readonly role: ResourceProcessRole;
  readonly state: ResourceProcessState;
}

export interface IResourceView {
  readonly processes?: readonly IResourceProcess[];
  readonly databasePools?: {
    readonly sitePoolSize: number;
    readonly appliedSitePoolSize: number | null;
    readonly coordinatorPoolSize: number;
    readonly editable: boolean;
  };
  readonly version: string;
  readonly capacity: number;
  readonly infrastructureCpu: number;
  readonly databaseCpu: number;
  readonly databasePlacement: ResourceDatabasePlacement;
  readonly cmsCpu: number;
  readonly cmsCpuBudget: number | null;
  readonly observedDatabaseCpu: number | null;
  readonly observedCmsCpu: number | null;
  readonly databaseVersion: string | null;
  readonly databaseImage: string | null;
  readonly recommendation: number;
  readonly unallocated: number;
  readonly managed: boolean;
  readonly allocationEditable: boolean;
  readonly activeDump: boolean;
  readonly dumpSiteId: string | null;
  readonly applyError: string | null;
  readonly sites: readonly IResourceSite[];
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid resource value');
  }

  return value;
}

function optionalString(value: unknown): string | null {
  return value === null ? null : string(value);
}

export function readResourceAddons(value: unknown): ICalibrationSiteAddon[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid add-on snapshot');
  }

  return value.map(entry => {
    const addon = object(entry);

    if (!Array.isArray(addon.queries)) {
      throw new Error('Invalid calibration queries');
    }

    return {
      addonKey: string(addon.addonKey),
      implementationVersion: string(addon.implementationVersion),
      runtimeDigest: string(addon.runtimeDigest),
      configurationHash: string(addon.configurationHash),
      queries: addon.queries.map(query => {
        const row = object(query);

        return { queryId: string(row.queryId), path: string(row.path) };
      }),
    };
  });
}

interface IResourceAllocationChange {
  readonly cmsCpu?: number;
  readonly expectedVersion: string;
  readonly sitePoolSize?: number;
  readonly databaseCpu: number;
  readonly sites: readonly { readonly siteId: string; readonly processes: number }[];
}

export async function installationResources(body?: IResourceAllocationChange): Promise<IResourceView> {
  const cancellation = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('Resource request timed out', 'TimeoutError');

      cancellation.abort(error);
      reject(error);
    }, body ? 120000 : 10000);
  });
  const request = requestResources(body, cancellation.signal);

  try {
    // Observe both outcomes immediately, including a transport that rejects after the deadline.
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timer);
    cancellation.abort();
  }
}

async function requestResources(body: IResourceAllocationChange | undefined,
  signal: AbortSignal): Promise<IResourceView> {
  const response = await fetch('/api/admin/installation/resources', {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'X-Zarya-Admin': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });

  if (!response.ok) {
    throw new ContentRequestError(response.status, 'InstallationResources');
  }

  const data = object(await response.json());

  if (!Array.isArray(data.siteDetails) || !Array.isArray(data.sites)) {
    throw new Error('Invalid resource sites');
  }

  const databasePlacement = Object.values(ResourceDatabasePlacement).find((entry) => entry === data.databasePlacement);

  if (!databasePlacement) {
    throw new Error('Invalid database placement');
  }

  const running = object(data.running);
  const errors = object(data.processErrors);
  const allocations = data.sites.map((entry: unknown) => object(entry));

  return {
    version: string(data.version),
    ...(Array.isArray(data.processes) ? {
      processes: data.processes.map((entry: unknown) => {
        const row = object(entry);
        const role = Object.values(ResourceProcessRole).find(role => role === row.role);
        const state = Object.values(ResourceProcessState).find(state => state === row.state);

        if (!role || !state) {
          throw new Error('Invalid process role/state');
        }

        return {
          pid: row.pid === null ? null : number(row.pid),
          siteId: row.siteId === null ? null : string(row.siteId),
          role,
          state,
        };
      }),
    } : {}),
    ...(data.databasePools ? {
      databasePools: {
        sitePoolSize: number(object(data.databasePools).sitePoolSize),
        appliedSitePoolSize: object(data.databasePools).appliedSitePoolSize === null
          ? null : number(object(data.databasePools).appliedSitePoolSize),
        coordinatorPoolSize: number(object(data.databasePools).coordinatorPoolSize),
        editable: object(data.databasePools).editable === true,
      },
    } : {}),
    capacity: number(data.capacity),
    infrastructureCpu: number(data.infrastructureCpu),
    databaseCpu: number(data.databaseCpu),
    databasePlacement,
    cmsCpu: number(data.cmsCpu),
    cmsCpuBudget: data.cmsCpuBudget == null ? null : number(data.cmsCpuBudget),
    observedDatabaseCpu: data.observedDatabaseCpu === null ? null : number(data.observedDatabaseCpu),
    observedCmsCpu: data.observedCmsCpu === null ? null : number(data.observedCmsCpu),
    databaseVersion: optionalString(data.databaseVersion),
    databaseImage: optionalString(data.databaseImage),
    recommendation: number(data.recommendation),
    unallocated: number(data.unallocated),
    managed: data.managed === true,
    allocationEditable: data.allocationEditable === true,
    activeDump: data.activeDump === true,
    dumpSiteId: data.dumpSiteId == null ? null : string(data.dumpSiteId),
    applyError: optionalString(data.applyError),
    sites: data.siteDetails.map((entry: unknown) => {
      const site = object(entry);
      const siteId = string(site.siteId);

      return {
        siteId,
        name: string(site.name),
        ...(site.addons === undefined ? {} : { addons: readResourceAddons(site.addons) }),
        domain: string(site.domain),
        dumpMode: string(site.dumpMode),
        processes: number(allocations.find((allocation) => allocation.siteId === siteId)?.processes),
        running: number(running[siteId]),
        error: optionalString(errors[siteId]),
      };
    }),
  };
}
