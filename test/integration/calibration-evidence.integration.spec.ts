import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { MongooseCalibrationRuns } from
  '../../src/adapters/outbound/persistence/mongoose/calibration/calibration-runs.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { HelperCalibrationLoad } from
  '../../src/adapters/outbound/runtime/calibration/helper-calibration-load.adapter.js';
import { CalibrationSearchService } from '../../src/app/services/calibration/calibration-search.service.js';
import { CalibrationScope } from '../../src/domain/calibration/calibration-profile.js';
import { CalibrationRunStatus, type ICalibrationRun } from '../../src/domain/calibration/calibration-run.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';
import type { ICalibrationResourceLease } from '../../src/ports/outbound/calibration/calibration-runtime.port.js';
import { calibrationProfile } from '../support/calibration.js';
import { dropHookTestDatabase } from '../support/hooks.js';

it.each([false, true])('persists only a recommendation backed by every helper API step (complete: %s)',
  async complete => {
    const uri = process.env.ZARYA_TEST_MONGO_URI;

    if (!uri) {
      throw new Error('Explicit test MongoDB required');
    }

    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-calibration-evidence-'));
    const socketPath = process.platform === 'win32' ? '\\\\.\\pipe\\zarya-calibration-' + randomUUID()
      : path.join(root, 'helper.sock');
    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(uri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    const metrics = {
      averageMs: 10,
      medianMs: 10,
      p95Ms: 20,
      p99Ms: 25,
      requests: 10,
      errors: 0,
      dropped: 0,
      successfulRps: 10,
    };
    const peerRequests: string[] = [];
    const helper = createServer((request, response) => {
      peerRequests.push(String(request.url));
      request.resume();
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        metrics,
        siteMetrics: { one: metrics },
        stepMetrics: complete ? {
          '["one","/"]': metrics,
          '["one","/api/fixture/read"]': metrics,
        } : {},
      }));
    });
    const original = {
      databaseCpu: 0.5, cmsCpu: 0.5, sitePoolSize: 1, sites: [{ siteId: 'one', processes: 1 }],
    };
    const lease: ICalibrationResourceLease = {
      original,
      read: async () => {
        throw new Error('Unexpected resource read');
      },
      apply: async configuration => ({
        ...configuration,
        version: 'observed',
        capacity: 1,
        logicalCpuCount: 1,
        infrastructureCpu: 0,
        databasePlacement: DatabasePlacement.ManagedLocal,
        databaseEngine: 'MongoDB',
        databaseVersion: 'fixture',
        databaseImage: null,
        observedDatabaseCpu: configuration.databaseCpu,
        observedCmsCpu: configuration.cmsCpu,
        managed: true,
        applyError: null,
        activeDump: false,
        running: { one: 1 },
        processErrors: { one: null },
        databasePools: {
          editable: true,
          coordinatorPoolSize: 1,
          sitePoolSize: configuration.sitePoolSize,
          appliedSitePoolSize: configuration.sitePoolSize,
        },
      }),
      restore: vi.fn(async () => {}),
    };

    try {
      await new Promise<void>((resolve, reject) => {
        helper.once('error', reject);
        helper.listen(socketPath, resolve);
      });
      await applyMigrations(connection, 'migrations');
      const runs = new MongooseCalibrationRuns(connection);
      const run: ICalibrationRun = {
        runId: randomUUID(),
        profile: {
          ...calibrationProfile(),
          scope: CalibrationScope.Installation,
          siteId: null,
          distributedCpu: 1,
          search: {
            concurrencyLevels: [1],
            processCounts: [1],
            poolSizes: [1],
            databaseCpuStep: 1,
            warmupSeconds: 0,
            probeSeconds: 1,
            confirmationSeconds: 1,
            maximumSeconds: 10,
          },
        },
        siteIds: ['one'],
        cmsVersion: '0.15.1',
        addonSnapshots: [{ siteId: 'one', addons: [] }],
        startedAt: new Date(),
        finishedAt: null,
        status: CalibrationRunStatus.Running,
        phase: 'Preparing',
        targets: [{
          siteId: 'one',
          path: '/',
          authority: 'one.test',
          share: 10000,
          effectiveShare: 100,
          releaseId: 'release',
          apiSteps: [{ addonKey: 'fixture', queryId: 'read', path: '/api/fixture/read' }],
        }],
        original,
        generatorPlacement: 'Controlled private helper peer; quota protocol double',
        referenceId: null,
        winnerId: null,
        restored: false,
        error: null,
      };

      await runs.create(run);
      await new CalibrationSearchService(runs, new HelperCalibrationLoad(socketPath, 'secret'), {
        nextId: randomUUID, nextVersion: randomUUID, now: () => new Date(),
      }).execute(run, lease, new AbortController().signal);
      const saved = await runs.get(run.runId);
      const measurements = await runs.measurements(run.runId);

      expect(saved).toMatchObject({ status: complete ? 'Completed' : 'Failed', restored: true });
      expect(peerRequests.length).toBeGreaterThan(0);
      expect(peerRequests.every(url => url === '/calibration/load')).toBe(true);
      expect(lease.restore).toHaveBeenCalledOnce();
      expect(measurements.length).toBeGreaterThan(0);

      if (complete) {
        expect(measurements.find(measurement => measurement.measurementId === saved?.winnerId))
          .toMatchObject({ kind: 'Confirmation', passed: true });
      } else {
        expect(saved?.winnerId).toBeNull();
        expect(measurements.every(measurement => !measurement.passed)).toBe(true);
      }
    } finally {
      helper.closeAllConnections();
      await new Promise<void>(resolve => helper.close(() => resolve()));
      await dropHookTestDatabase(connection, database);
      await rm(root, { recursive: true, force: true });
    }
  });
