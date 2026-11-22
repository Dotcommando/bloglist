import { ContentRequestError, object, string } from '../../shared/api/content-api.js';
import {
  CalibrationReferenceKind, CalibrationScope, type ICalibrationConfiguration, type ICalibrationDetail,
  type ICalibrationDraft, type ICalibrationMeasurement, type ICalibrationMetrics, type ICalibrationProfile,
  type ICalibrationRun,
} from './calibration.types.js';

const base = '/api/admin/installation/calibration';

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid calibration value');
  }

  return value;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid calibration list');
  }

  return value;
}

function nullable(value: unknown): number | null {
  return value === null ? null : number(value);
}

function textOrNull(value: unknown): string | null {
  return value === null ? null : string(value);
}

export async function calibrationRequest(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('Calibration request timed out', 'TimeoutError');

      controller.abort(error);
      reject(error);
    }, method === 'GET' ? 10000 : 120000);
  });
  const request = (async (): Promise<unknown> => {
    const response = await fetch(base + path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-Zarya-Admin': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      throw new ContentRequestError(response.status, 'Calibration');
    }

    return response.json();
  })();

  try {
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

import { readResourceAddons } from '../resources/resources-api.js';

function profile(value: unknown): ICalibrationProfile {
  const row = object(value);
  const criteria = object(row.criteria);
  const search = object(row.search);
  const scope = Object.values(CalibrationScope).find(scope => scope === row.scope);

  if (!scope) {
    throw new Error('Invalid calibration scope');
  }

  return {
    profileId: string(row.profileId),
    version: string(row.version),
    name: string(row.name),
    scope,
    siteId: textOrNull(row.siteId),
    distributedCpu: number(row.distributedCpu),
    createdAt: string(row.createdAt),
    updatedAt: string(row.updatedAt),
    targets: array(row.targets).map(value => {
      const target = object(value);
      const kind = Object.values(CalibrationReferenceKind).find(kind => kind === target.kind);

      if (!kind) {
        throw new Error('Invalid calibration target');
      }

      return {
        siteId: string(target.siteId),
        kind,
        reference: string(target.reference),
        share: number(target.share),
        ...(target.apiSteps === undefined ? {} : {
          apiSteps: array(target.apiSteps).map(step => {
            const row = object(step);

            return { addonKey: string(row.addonKey), queryId: string(row.queryId) };
          }),
        }),
      };
    }),
    criteria: {
      averageMs: nullable(criteria.averageMs),
      medianMs: nullable(criteria.medianMs),
      p95Ms: nullable(criteria.p95Ms),
      p99Ms: nullable(criteria.p99Ms),
    },
    search: {
      concurrencyLevels: array(search.concurrencyLevels).map(number),
      processCounts: array(search.processCounts).map(number),
      poolSizes: array(search.poolSizes).map(number),
      databaseCpuStep: number(search.databaseCpuStep),
      warmupSeconds: number(search.warmupSeconds),
      probeSeconds: number(search.probeSeconds),
      confirmationSeconds: number(search.confirmationSeconds),
      maximumSeconds: number(search.maximumSeconds),
    },
  };
}

function run(value: unknown): ICalibrationRun {
  const row = object(value);

  return {
    runId: string(row.runId),
    profile: profile(row.profile),
    startedAt: string(row.startedAt),
    finishedAt: textOrNull(row.finishedAt),
    status: string(row.status),
    phase: string(row.phase),
    restored: row.restored === true,
    winnerId: textOrNull(row.winnerId),
    referenceId: textOrNull(row.referenceId),
    error: textOrNull(row.error),
    generatorPlacement: string(row.generatorPlacement),
    ...(row.addonSnapshots === undefined ? {} : {
      addonSnapshots: array(row.addonSnapshots).map(snapshot => {
        const value = object(snapshot);

        return { siteId: string(value.siteId), addons: readResourceAddons(value.addons) };
      }),
    }),
  };
}

function configuration(value: unknown): ICalibrationConfiguration {
  const row = object(value);

  return {
    databaseCpu: number(row.databaseCpu),
    cmsCpu: number(row.cmsCpu),
    sitePoolSize: number(row.sitePoolSize),
    sites: array(row.sites).map(value => {
      const site = object(value);

      return { siteId: string(site.siteId), processes: number(site.processes) };
    }),
  };
}

function metrics(value: unknown): ICalibrationMetrics {
  const row = object(value);

  return {
    averageMs: number(row.averageMs),
    medianMs: number(row.medianMs),
    p95Ms: number(row.p95Ms),
    p99Ms: number(row.p99Ms),
    requests: number(row.requests),
    errors: number(row.errors),
    dropped: number(row.dropped),
    successfulRps: number(row.successfulRps),
  };
}

function measurement(value: unknown): ICalibrationMeasurement {
  const row = object(value);

  return {
    measurementId: string(row.measurementId),
    kind: string(row.kind),
    configuration: configuration(row.configuration),
    metrics: metrics(row.metrics),
    ...(row.stepMetrics === undefined ? {} : {
      stepMetrics: Object.fromEntries(Object.entries(object(row.stepMetrics))
        .map(([key, value]) => [key, metrics(value)])),
    }),
    siteMetrics: Object.fromEntries(Object.entries(object(row.siteMetrics))
      .map(([key, value]) => [key, metrics(value)])),
    concurrency: number(row.concurrency),
    passed: row.passed === true,
    startedAt: string(row.startedAt),
    finishedAt: string(row.finishedAt),
  };
}

export async function calibrationProfiles(siteId: string, cursor: string | null = null):
Promise<{ items: ICalibrationProfile[]; nextCursor: string | null }> {
  const row = object(await calibrationRequest('/profiles?siteId=' + encodeURIComponent(siteId)
    + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')));

  return { items: array(row.items).map(profile), nextCursor: textOrNull(row.nextCursor) };
}

export async function saveCalibrationProfile(draft: ICalibrationDraft, previous: ICalibrationProfile | null):
Promise<ICalibrationProfile> {
  return profile(await calibrationRequest('/profiles' + (previous ? '/' + previous.profileId : ''),
    previous ? 'PUT' : 'POST', previous ? { expectedVersion: previous.version, draft } : draft));
}

export async function latestCalibrations(siteId: string): Promise<ICalibrationRun[]> {
  return array(await calibrationRequest('/runs?siteId=' + encodeURIComponent(siteId))).map(run);
}

export async function calibrationDetail(runId: string): Promise<ICalibrationDetail> {
  const row = object(await calibrationRequest('/runs/' + encodeURIComponent(runId)));

  return { run: run(row.run), measurements: array(row.measurements).map(measurement) };
}

export async function startCalibration(profile: ICalibrationProfile): Promise<ICalibrationRun> {
  return run(await calibrationRequest('/runs', 'POST', {
    profileId: profile.profileId, expectedVersion: profile.version,
  }));
}
