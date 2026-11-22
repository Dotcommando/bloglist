import type { ICalibrationConfiguration } from '../../../../domain/calibration/calibration-run.js';
import type { IInstallationResourceState } from '../../../../domain/resources/installation-resources.js';
import { DatabasePlacement, type ISiteProcessAllocation }
  from '../../../../domain/resources/site-process-allocation.js';
import type { IResourceChange } from '../../../../ports/outbound/resources/installation-resources.port.js';
import { readInstallationProcesses } from './installation-process-codec.js';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RangeError('Invalid resource record');
  }

  return Object.fromEntries(Object.entries(value));
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError('Invalid resource number');
  }

  return value;
}

function string(value: unknown): string {
  if (typeof value !== 'string') {
    throw new RangeError('Invalid resource text');
  }

  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new RangeError('Invalid resource flag');
  }

  return value;
}

function nullableString(value: unknown): string | null {
  return value === null ? null : string(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null ? null : number(value);
}

function sites(value: unknown): readonly ISiteProcessAllocation[] {
  if (!Array.isArray(value)) {
    throw new RangeError('Invalid resource sites');
  }

  return value.map((entry: unknown) => {
    const row = record(entry);

    return { siteId: string(row.siteId), processes: number(row.processes) };
  });
}

export function readControlResourceChange(value: unknown): IResourceChange {
  const row = record(value);

  return {
    expectedVersion: string(row.expectedVersion),
    databaseCpu: number(row.databaseCpu),
    sites: sites(row.sites),
    ...(row.cmsCpu === undefined ? {} : { cmsCpu: number(row.cmsCpu) }),
    ...(row.sitePoolSize === undefined ? {} : { sitePoolSize: number(row.sitePoolSize) }),
  };
}

export function readControlCalibrationConfiguration(value: unknown): ICalibrationConfiguration {
  const row = record(value);

  return {
    databaseCpu: number(row.databaseCpu),
    cmsCpu: number(row.cmsCpu),
    sitePoolSize: number(row.sitePoolSize),
    sites: sites(row.sites),
  };
}

export function readControlCalibrationLease(value: unknown): { id: string; original: ICalibrationConfiguration } {
  const row = record(value);

  return { id: string(row.id), original: readControlCalibrationConfiguration(row.original) };
}

export function readControlResourceVoid(value: unknown): void {
  if (value !== undefined) {
    throw new RangeError('Unexpected resource command result');
  }
}

export function readControlResourceState(value: unknown): IInstallationResourceState {
  const row = record(value);
  const placement = Object.values(DatabasePlacement).find((entry) => entry === row.databasePlacement);

  if (!placement) {
    throw new RangeError('Invalid database placement');
  }

  const pools = row.databasePools === undefined ? undefined : record(row.databasePools);

  return {
    capacity: number(row.capacity),
    databaseCpu: number(row.databaseCpu),
    infrastructureCpu: number(row.infrastructureCpu),
    sites: sites(row.sites),
    version: string(row.version),
    ...(row.processes === undefined ? {} : { processes: readInstallationProcesses(row.processes) }),
    databasePlacement: placement,
    logicalCpuCount: number(row.logicalCpuCount),
    cmsCpu: number(row.cmsCpu),
    databaseEngine: string(row.databaseEngine),
    databaseVersion: nullableString(row.databaseVersion),
    databaseImage: nullableString(row.databaseImage),
    observedDatabaseCpu: nullableNumber(row.observedDatabaseCpu),
    observedCmsCpu: nullableNumber(row.observedCmsCpu),
    managed: boolean(row.managed),
    applyError: nullableString(row.applyError),
    activeDump: boolean(row.activeDump),
    running: Object.fromEntries(Object.entries(record(row.running)).map(([key, value]) => [key, number(value)])),
    processErrors: Object.fromEntries(Object.entries(record(row.processErrors))
      .map(([key, value]) => [key, nullableString(value)])),
    ...(row.cmsCpuBudget === undefined ? {} : { cmsCpuBudget: number(row.cmsCpuBudget) }),
    ...(row.dumpSiteId === undefined ? {} : { dumpSiteId: nullableString(row.dumpSiteId) }),
    ...(pools ? {
      databasePools: {
        sitePoolSize: number(pools.sitePoolSize),
        appliedSitePoolSize: nullableNumber(pools.appliedSitePoolSize),
        coordinatorPoolSize: number(pools.coordinatorPoolSize),
        editable: boolean(pools.editable),
      },
    } : {}),
  };
}
