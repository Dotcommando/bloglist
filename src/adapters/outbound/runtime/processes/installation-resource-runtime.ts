import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ICalibrationConfiguration } from '../../../../domain/calibration/calibration-run.js';
import type { IInstallationProcess } from '../../../../domain/resources/installation-process.js';
import type { IInstallationResourceState } from '../../../../domain/resources/installation-resources.js';
import { DatabasePlacement, type IResourceAllocation, resolveDumpExecution, validateResourceAllocation } from
  '../../../../domain/resources/site-process-allocation.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { ICalibrationResourceLease } from '../../../../ports/outbound/calibration/calibration-runtime.port.js';
import type { IContainerResourceObservation, IContainerResourcesPort } from
  '../../../../ports/outbound/resources/container-resources.port.js';
import type { IDumpCapacityLease } from '../../../../ports/outbound/resources/dump-capacity.port.js';
import type { IInstallationResourcesPort, IResourceChange } from
  '../../../../ports/outbound/resources/installation-resources.port.js';
import type { SiteProcessPool } from './site-process-pool.js';

interface ISiteDatabasePools {
  configure(size: number): Promise<void>;
  applied(size: number): boolean;
}

interface IStoredAllocation {
  readonly cmsCpuBudget?: number;
  readonly sitePoolSize: number;
  readonly version: string;
  readonly databaseCpu: number;
  readonly sites: IResourceAllocation['sites'];
}

export interface IResourceRuntimeSettings {
  readonly root: string;
  readonly capacity: number;
  readonly logicalCpuCount: number;
  readonly infrastructureCpu: number;
  readonly cmsCpuBudget?: number;
  readonly databasePlacement: DatabasePlacement;
  readonly databaseVersion: string | null;
  readonly coordinatorPoolSize?: number;
}

export class InstallationResourceRuntime implements IInstallationResourcesPort {
  private stored: IStoredAllocation | null = null;
  private observed: IContainerResourceObservation | null = null;
  private error: string | null = null;
  private busy = false;
  private calibrationActive = false;
  private addonUpdateActive = false;
  private dumpActive = false;
  private dumpSiteId: string | null = null;
  private initialized = false;
  private observedDatabaseVersion: string | null = null;

  setDatabaseVersion(version: string): void {
    this.observedDatabaseVersion = version;
  }

  constructor(private readonly settings: IResourceRuntimeSettings,
    private readonly pool: Pick<SiteProcessPool, 'resize' | 'running' | 'failure' | 'lend'>,
    private readonly control?: IContainerResourcesPort,
    private readonly databasePools?: ISiteDatabasePools,
    private readonly observeProcesses?: () => readonly IInstallationProcess[]) {
    if (
      !Object.values(DatabasePlacement).includes(settings.databasePlacement)
      || settings.databasePlacement === DatabasePlacement.UnmanagedLocal
      && settings.cmsCpuBudget === undefined
    ) {
      throw new Error('Explicit database placement and unmanaged CMS budget are required');
    }
    if (control && settings.databasePlacement !== DatabasePlacement.ManagedLocal) {
      throw new Error('Database control requires an explicitly managed local database');
    }
  }

  async read(siteIds: readonly string[]): Promise<IInstallationResourceState> {
    if (!this.initialized || siteIds.some((siteId) => !this.stored?.sites.some((entry) => entry.siteId === siteId))) {
      this.admitChange();
      const previous = this.stored;
      let persisted = false;

      try {
        if (!this.stored) {
          try {
            let savedPath = path.join(this.settings.root, 'allocation.json');

            try {
              await readFile(path.join(this.settings.root, 'calibration-journal.json'));
              savedPath = path.join(this.settings.root, 'calibration-journal.json');
            } catch (error) {
              if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
                throw error;
              }
            }
            const data: unknown = JSON.parse(await readFile(savedPath, 'utf8'));

            if (
              !data
              || typeof data !== 'object'
              || !('version' in data)
              || typeof data.version !== 'string'
              || !('databaseCpu' in data)
              || typeof data.databaseCpu !== 'number'
              || !('sites' in data)
              || !Array.isArray(data.sites)
              || ('sitePoolSize' in data
              && (typeof data.sitePoolSize !== 'number'
                || !Number.isSafeInteger(data.sitePoolSize)
              || data.sitePoolSize < 1))
            ) {
              throw new Error('Invalid saved resource configuration');
            }

            const placement = 'databasePlacement' in data
              ? Object.values(DatabasePlacement).find((entry) => entry === data.databasePlacement)
              : DatabasePlacement.ManagedLocal;

            if (!placement) {
              throw new Error('Invalid saved database placement');
            }

            const changed = placement !== this.settings.databasePlacement;

            this.stored = {
              version: changed ? randomUUID() : data.version,
              ...('cmsCpuBudget' in data && typeof data.cmsCpuBudget === 'number'
                ? { cmsCpuBudget: data.cmsCpuBudget } : {}),
              sitePoolSize: 'sitePoolSize' in data && typeof data.sitePoolSize === 'number'
                ? data.sitePoolSize : this.settings.coordinatorPoolSize ?? 5,
              databaseCpu: changed ? this.settings.databasePlacement === DatabasePlacement.ManagedLocal
                ? Math.min(1, this.settings.capacity) : 0 : data.databaseCpu,
              sites: data.sites.map((entry: unknown) => {
                if (
                  !entry
                  || typeof entry !== 'object'
                  || !('siteId' in entry)
                  || typeof entry.siteId !== 'string'
                  || !('processes' in entry)
                  || typeof entry.processes !== 'number'
                ) {
                  throw new Error('Invalid saved site allocation');
                }

                return { siteId: entry.siteId, processes: entry.processes };
              }),
            };
          } catch (error) {
            if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
              throw error;
            }
            this.stored = {
              version: randomUUID(),
              sitePoolSize: this.settings.coordinatorPoolSize ?? 5,
              databaseCpu: this.settings.databasePlacement === DatabasePlacement.ManagedLocal
                ? Math.min(1, this.settings.capacity) : 0,
              sites: [],
            };
          }
        }

        const additions = siteIds.filter((siteId) => !this.stored!.sites.some((entry) => entry.siteId === siteId));

        if (additions.length) {
          const next = {
            ...this.stored,
            version: randomUUID(),
            sites: [...this.stored.sites,
              ...additions.map((siteId) => ({ siteId, processes: 1 }))],
          };

          this.validate(next);
          this.stored = next;
        }
        this.validate(this.stored);
        await this.persist();
        persisted = true;
        await this.apply();
        this.initialized = true;
        await rm(path.join(this.settings.root, 'calibration-journal.json'), { force: true });
      } catch (error) {
        if (!persisted) {
          this.stored = previous;
        }
        throw error;
      } finally {
        this.busy = false;
      }
    }

    const value = this.stored!;
    const allocation = this.allocation(value);

    return {
      ...allocation,
      version: value.version,
      ...(this.observeProcesses ? { processes: this.observeProcesses() } : {}),
      databasePools: {
        sitePoolSize: value.sitePoolSize,
        appliedSitePoolSize: this.databasePools?.applied(value.sitePoolSize) ? value.sitePoolSize : null,
        coordinatorPoolSize: this.settings.coordinatorPoolSize ?? 5,
        editable: this.databasePools !== undefined,
      },
      databasePlacement: this.settings.databasePlacement,
      logicalCpuCount: this.settings.logicalCpuCount,
      cmsCpu: this.cmsCpu(value),
      databaseEngine: 'MongoDB',
      databaseVersion: this.observedDatabaseVersion ?? this.settings.databaseVersion,
      databaseImage: this.observed?.databaseImage ?? null,
      observedDatabaseCpu: this.observed?.databaseCpu ?? null,
      observedCmsCpu: this.observed?.cmsCpu ?? null,
      managed: this.control !== undefined,
      applyError: this.error,
      activeDump: this.dumpActive,
      dumpSiteId: this.dumpSiteId,
      running: Object.fromEntries(value.sites.map((entry) => [entry.siteId, this.pool.running(entry.siteId)])),
      processErrors: Object.fromEntries(value.sites.map((entry) => [entry.siteId, this.pool.failure(entry.siteId)])),
    };
  }

  async change(input: IResourceChange): Promise<void> {
    return this.changeOwned(input, false);
  }

  private async changeOwned(input: IResourceChange, calibrationOwner: boolean): Promise<void> {
    this.admitChange(calibrationOwner);

    try {
      if (input.expectedVersion !== this.stored?.version) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Resource configuration changed');
      }
      if (
        (input.databaseCpu !== this.stored.databaseCpu
        || input.cmsCpu !== undefined
        && input.cmsCpu !== this.cmsCpu(this.stored))
        && !this.control
      ) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Container resource control is unavailable');
      }
      if (input.sitePoolSize !== undefined && !this.databasePools) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Database pool control is unavailable');
      }

      const next = {
        version: randomUUID(),
        ...(input.cmsCpu !== undefined ? { cmsCpuBudget: input.cmsCpu }
          : this.stored.cmsCpuBudget !== undefined ? { cmsCpuBudget: this.stored.cmsCpuBudget } : {}),
        databaseCpu: input.databaseCpu,
        sites: [...input.sites],
        sitePoolSize: input.sitePoolSize ?? this.stored.sitePoolSize,
      };

      this.validate(next);
      await this.persist(next);
      this.stored = next;
      await this.apply();
    } finally {
      this.busy = false;
    }
  }

  async beginAddonUpdate(): Promise<() => Promise<void>> {
    this.admitChange();

    try {
      if (!this.initialized || this.error) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Resources must be reconciled before an add-on update');
      }
      this.addonUpdateActive = true;
    } finally {
      this.busy = false;
    }
    let released = false;

    return async () => {
      if (!released) {
        released = true;
        this.addonUpdateActive = false;
      }
    };
  }

  async beginCalibration(): Promise<ICalibrationResourceLease> {
    this.admitChange();

    if (!this.stored || this.error) {
      this.busy = false;
      throw new BusinessError(BusinessErrorCode.Conflict,
        'Resources must be reconciled before calibration');
    }

    const before = { ...this.stored, sites: this.stored.sites.map(site => ({ ...site })) };
    const ids = before.sites.map(site => site.siteId);
    const original: ICalibrationConfiguration = {
      databaseCpu: before.databaseCpu,
      cmsCpu: this.cmsCpu(before),
      sitePoolSize: before.sitePoolSize,
      sites: before.sites,
    };
    const journal = path.join(this.settings.root, 'calibration-journal.json');
    const temporary = journal + '.' + randomUUID();
    let published = false;

    try {
      await writeFile(temporary, JSON.stringify({
        ...before, databasePlacement: this.settings.databasePlacement,
      }), { flag: 'wx', mode: 0o600 });
      await link(temporary, journal);
      published = true;
      await rm(temporary);
      this.calibrationActive = true;
    } catch (error) {
      const cleanup = await Promise.allSettled([
        rm(temporary, { force: true }),
        ...(published ? [rm(journal, { force: true })] : []),
      ]);
      const failures = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);

      if (failures.length) {
        throw new AggregateError([error, ...failures], 'Calibration journal preparation and cleanup failed');
      }
      throw error;
    } finally {
      this.busy = false;
    }
    let released = false;

    return {
      original,
      read: () => this.read(ids),
      apply: async configuration => {
        if (released || !this.calibrationActive) {
          throw new BusinessError(BusinessErrorCode.Conflict,
            'Calibration lease expired');
        }
        if (
          configuration.sites.length !== ids.length
          || configuration.sites.some(site => !ids.includes(site.siteId))
        ) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Calibration site topology changed');
        }
        await this.changeOwned({
          expectedVersion: this.stored!.version,
          databaseCpu: configuration.databaseCpu,
          ...(this.control ? { cmsCpu: configuration.cmsCpu } : {}),
          ...(this.databasePools ? { sitePoolSize: configuration.sitePoolSize } : {}),
          sites: configuration.sites,
        }, true);
        const state = await this.read(ids);

        if (
          state.applyError
          || state.sites.some(site => state.running[site.siteId] !== site.processes)
          || this.databasePools
          && state.databasePools?.appliedSitePoolSize !== configuration.sitePoolSize
          || this.control
          && (Math.abs((state.observedCmsCpu ?? 0) - configuration.cmsCpu) > 1e-8
            || Math.abs((state.observedDatabaseCpu ?? 0) - configuration.databaseCpu) > 1e-8)
        ) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Calibration resources were not fully applied');
        }

        return state;
      },
      restore: async () => {
        if (released) {
          return;
        }
        this.admitChange(true);

        try {
          const next = { ...before, version: randomUUID() };

          await this.persist(next);
          this.stored = next;
          await this.apply();

          if (next.sites.some(site => this.pool.running(site.siteId) !== site.processes)) {
            throw new Error('Calibration restoration is incomplete');
          }
          await rm(path.join(this.settings.root, 'calibration-journal.json'));
          released = true;
          this.calibrationActive = false;
        } catch (error) {
          this.error = 'Calibration restoration failed; restart the coordinator to recover the resource journal';
          throw error;
        } finally {
          this.busy = false;
        }
      },
    };
  }

  async reserveForProcess(siteId: string, requestOwner: string): Promise<IDumpCapacityLease> {
    this.admitChange();
    this.dumpActive = true;
    this.dumpSiteId = siteId;
    let restore: (() => Promise<void>) | undefined;

    try {
      if (!this.stored || this.error !== null) {
        throw new Error('Resource allocation must be initialized and reconciled before dump admission');
      }

      const mode = resolveDumpExecution(this.allocation(this.stored), siteId);

      if (mode === 'BorrowedProcess') {
        restore = await this.pool.lend(siteId, requestOwner);
      }

      let released = false;

      return {
        mode,
        release: async () => {
          if (released) {
            return;
          }
          released = true;

          try {
            await restore?.();
          } finally {
            this.dumpActive = false;
            this.dumpSiteId = null;
            this.busy = false;
          }
        },
      };
    } catch (error) {
      this.dumpActive = false;
      this.dumpSiteId = null;
      this.busy = false;
      throw error;
    }
  }

  private admitChange(calibrationOwner = false): void {
    if (this.busy || this.addonUpdateActive || this.calibrationActive && !calibrationOwner) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Resource allocation or dump capture is active');
    }
    this.busy = true;
  }

  private allocation(value: IStoredAllocation): IResourceAllocation {
    return {
      capacity: this.settings.capacity,
      infrastructureCpu: this.settings.infrastructureCpu,
      databaseCpu: value.databaseCpu,
      sites: value.sites,
      ...(value.cmsCpuBudget !== undefined || this.settings.cmsCpuBudget !== undefined
        ? { cmsCpuBudget: value.cmsCpuBudget ?? this.settings.cmsCpuBudget } : {}),
    };
  }

  private cmsCpu(value: IStoredAllocation): number {
    const databaseCpu = value.databaseCpu;
    const planned = this.settings.capacity <= 1 ? this.settings.capacity
      : this.settings.capacity - databaseCpu - this.settings.infrastructureCpu;

    return Math.min(planned, value.cmsCpuBudget ?? this.settings.cmsCpuBudget ?? this.settings.capacity);
  }

  private validate(value: IStoredAllocation): void {
    validateResourceAllocation(this.allocation(value));

    if (
      value.cmsCpuBudget !== undefined
      && (!Number.isFinite(value.cmsCpuBudget)
      || value.cmsCpuBudget <= 0
      || value.cmsCpuBudget > this.settings.capacity
      || this.settings.capacity > 1
      && value.cmsCpuBudget + value.databaseCpu + this.settings.infrastructureCpu > this.settings.capacity + 1e-8)
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid shared CMS CPU budget');
    }
    if (!Number.isSafeInteger(value.sitePoolSize) || value.sitePoolSize < 1) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Database pool size must be a positive integer');
    }

    const managedLocal = this.settings.databasePlacement === DatabasePlacement.ManagedLocal;

    if (managedLocal ? value.databaseCpu <= 0 : value.databaseCpu !== 0) {
      throw new BusinessError(BusinessErrorCode.Validation,
        'Database CPU quota does not match its configured placement');
    }
    if (this.settings.capacity > 1 && value.databaseCpu + this.settings.infrastructureCpu >= this.settings.capacity) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Database quota leaves no CMS capacity');
    }
  }

  private async persist(value: IStoredAllocation = this.stored!): Promise<void> {
    await mkdir(this.settings.root, { recursive: true, mode: 0o700 });
    const destination = path.join(this.settings.root, 'allocation.json');
    const temporary = destination + '.' + randomUUID();

    try {
      const saved = { ...value, databasePlacement: this.settings.databasePlacement };

      await writeFile(temporary, JSON.stringify(saved), { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
    } catch (error) {
      this.error = 'Resource configuration could not be persisted; retry after repairing private storage';
      await rm(temporary, { force: true });
      throw error;
    }
  }

  private async apply(): Promise<void> {
    this.error = null;

    try {
      if (this.control) {
        this.observed = await this.control.apply({
          databaseCpu: this.stored!.databaseCpu,
          cmsCpu: this.cmsCpu(this.stored!),
        });
      }

      await this.databasePools?.configure(this.stored!.sitePoolSize);

      for (const entry of this.stored!.sites) {
        await this.pool.resize(entry.siteId, entry.processes);
      }
    } catch (error) {
      this.error = 'Resource application is incomplete; inspect observed limits and running processes';

      if (this.control) {
        try {
          this.observed = await this.control.observe();
        } catch {
          this.observed = null;
        }
      }
      throw error;
    }
  }
}
