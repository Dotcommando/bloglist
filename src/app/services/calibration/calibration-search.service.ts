import { CalibrationScope } from '../../../domain/calibration/calibration-profile.js';
import {
  CalibrationMeasurementKind, CalibrationRunStatus, type ICalibrationConfiguration,
  type ICalibrationMeasurement, type ICalibrationRun,
} from '../../../domain/calibration/calibration-run.js';
import { calibrationNeighbours, calibrationPasses } from '../../../domain/calibration/calibration-search.policy.js';
import type { ICalibrationValuesPort } from '../../../ports/outbound/calibration/calibration-profiles.port.js';
import type { ICalibrationRunsPort } from '../../../ports/outbound/calibration/calibration-runs.port.js';
import type { ICalibrationLoadPort, ICalibrationResourceLease } from
  '../../../ports/outbound/calibration/calibration-runtime.port.js';
/** Executes a bounded search and owns restoration on every exit. HTTP only starts/observes the job. */
import type { ISiteResourceCatalogPort } from '../../../ports/outbound/resources/site-resource-catalog.port.js';

export class CalibrationSearchService {
  constructor(private readonly runs: ICalibrationRunsPort, private readonly load: ICalibrationLoadPort,
    private readonly values: ICalibrationValuesPort, private readonly sites?: ISiteResourceCatalogPort) {}

  async execute(initial: ICalibrationRun, lease: ICalibrationResourceLease, signal: AbortSignal,
    onFinal: (run: ICalibrationRun) => void = () => {}): Promise<void> {
    let run = initial;
    const measured: ICalibrationMeasurement[] = [];
    const assertComposition = async (): Promise<void> => {
      if (run.addonSnapshots && this.sites) {
        const snapshot = (await this.sites.list()).filter(site => run.siteIds.includes(site.siteId))
          .map(site => ({ siteId: site.siteId, addons: site.addons ?? [] }))
          .sort((a, b) => a.siteId.localeCompare(b.siteId));

        if (JSON.stringify(snapshot) !== JSON.stringify(run.addonSnapshots)) {
          throw new Error('Add-on composition changed during calibration');
        }
      }
    };
    const tested = new Set<string>();
    const search = run.profile.search;
    const deadline = initial.startedAt.getTime() + search.maximumSeconds * 1000;
    const remaining = (): number => (deadline - this.values.now().getTime()) / 1000;
    const best = (): ICalibrationMeasurement | undefined => measured.filter(m => m.passed)
      .sort((a, b) => b.metrics.successfulRps - a.metrics.successfulRps
        || a.configuration.sites.reduce((n, s) => n + s.processes, 0)
        - b.configuration.sites.reduce((n, s) => n + s.processes, 0))[0];
    const measure = async (configuration: ICalibrationConfiguration, kind: CalibrationMeasurementKind,
      concurrency: number, seconds: number): Promise<ICalibrationMeasurement> => {
      signal.throwIfAborted();
      run = { ...run, phase: kind + ' / ' + concurrency };
      await this.runs.save(run);
      const observed = await lease.apply(configuration);

      if (
        run.profile.scope === CalibrationScope.Installation
        && (
          Math.abs(configuration.databaseCpu + configuration.cmsCpu - run.profile.distributedCpu) > 1e-8
        || !observed.managed
        || observed.applyError
        || Math.abs((observed.observedDatabaseCpu ?? 0) - configuration.databaseCpu) > 1e-8
        || Math.abs((observed.observedCmsCpu ?? 0) - configuration.cmsCpu) > 1e-8
        || observed.databasePools?.appliedSitePoolSize !== configuration.sitePoolSize
        || configuration.sites.some(site => observed.running[site.siteId] !== site.processes)
        )
      ) {
        throw new Error('Requested calibration CPU budget, pools or processes were not actually applied');
      }

      signal.throwIfAborted();
      await assertComposition();
      const startedAt = this.values.now();
      const result = await this.load.measure({
        targets: run.targets,
        concurrency,
        warmupSeconds: search.warmupSeconds,
        seconds,
      }, signal);

      await assertComposition();
      const positive = run.targets.filter(target => target.share > 0);
      const completeSteps = !positive.some(target => target.apiSteps?.length) || positive.every(target =>
        [target.path, ...(target.apiSteps ?? []).map(step => step.path)].every(path => {
          const metrics = result.stepMetrics?.[JSON.stringify([target.siteId, path])];

          return metrics !== undefined && calibrationPasses(metrics, run.profile.criteria);
        }));
      const passed = completeSteps
        && Object.values(result.stepMetrics ?? {}).every(metrics => calibrationPasses(metrics, run.profile.criteria))
        && calibrationPasses(result.metrics, run.profile.criteria)
        && run.siteIds.every(siteId => result.siteMetrics[siteId] !== undefined
          && calibrationPasses(result.siteMetrics[siteId]!, run.profile.criteria));
      const measurement: ICalibrationMeasurement = {
        measurementId: this.values.nextId(),
        runId: run.runId,
        kind,
        configuration,
        observed,
        concurrency,
        startedAt,
        finishedAt: this.values.now(),
        ...result,
        passed,
      };

      await this.runs.append(measurement);
      measured.push(measurement);

      return measurement;
    };
    const probe = async (configuration: ICalibrationConfiguration, kind: CalibrationMeasurementKind): Promise<void> => {
      const key = JSON.stringify(configuration);

      if (tested.has(key)) {
        return;
      }
      tested.add(key);

      for (const concurrency of search.concurrencyLevels) {
        if (
          remaining() < search.warmupSeconds + search.probeSeconds
          + search.warmupSeconds + search.confirmationSeconds
        ) {
          break;
        }

        const measurement = await measure(configuration, kind, concurrency, search.probeSeconds);

        if (kind === CalibrationMeasurementKind.Reference && measurement.passed) {
          run = { ...run, referenceId: measurement.measurementId };
        }
        if (!measurement.passed) {
          break;
        }
      }
    };

    try {
      signal.throwIfAborted();
      const full = run.profile.scope === CalibrationScope.Installation;
      const budget = Math.round(run.profile.distributedCpu * 10);
      const database = budget > 10 ? 10 : Math.floor(budget / 2);
      const baseline: ICalibrationConfiguration = {
        ...lease.original,
        ...(full ? {
          databaseCpu: database / 10,
          cmsCpu: (budget - database) / 10,
        } : {}),
        sites: lease.original.sites.map(site => run.siteIds.includes(site.siteId) ? { ...site, processes: 1 } : site),
      };

      await probe(baseline, CalibrationMeasurementKind.Reference);

      // Coordinate search: process count, pool and fractional database budget, then repeat around the best result.
      for (let pass = 0; pass < 2; pass++) {
        const around = best()?.configuration ?? baseline;

        for (const configuration of calibrationNeighbours(run.profile, around)) {
          await probe(configuration, CalibrationMeasurementKind.Probe);
        }
      }
      const candidate = best();

      if (!candidate || remaining() < search.warmupSeconds + search.confirmationSeconds) {
        throw new Error('No candidate could be confirmed within the experiment time budget');
      }

      const confirmed = await measure(candidate.configuration, CalibrationMeasurementKind.Confirmation,
        candidate.concurrency, search.confirmationSeconds);

      if (!confirmed.passed) {
        throw new Error('The best candidate failed confirmation');
      }
      run = { ...run, status: CalibrationRunStatus.Completed, winnerId: confirmed.measurementId, error: null };
    } catch (error) {
      run = {
        ...run,
        status: signal.aborted ? CalibrationRunStatus.Cancelled : CalibrationRunStatus.Failed,
        error: signal.aborted ? 'Calibration cancelled' : error instanceof Error ? error.message : 'Calibration failed',
        winnerId: null,
      };
    } finally {
      try {
        await lease.restore();
        run = { ...run, restored: true };
      } catch {
        run = {
          ...run,
          status: CalibrationRunStatus.RestorationRequired,
          restored: false,
          winnerId: null,
          error: 'Original resource restoration failed. '
            + 'Restart the coordinator to recover its durable resource journal.',
        };
      }
      const finished = { ...run, finishedAt: this.values.now(), phase: 'Finished' };

      onFinal(finished);
      await this.runs.save(finished);
    }
  }
}
