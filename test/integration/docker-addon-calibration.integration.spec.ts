import { readFile, writeFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

import type { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import { localResourceExchange, resourceRecord } from
  '../../src/adapters/outbound/runtime/docker/container-resource.protocol.js';
import { DockerEngineResourceBoundary } from
  '../../src/adapters/outbound/runtime/docker/docker-engine-resource.boundary.js';
import {
  CalibrationPageReferenceKind, CalibrationScope, type ICalibrationProfile, type ICalibrationProfileDraft,
} from '../../src/domain/calibration/calibration-profile.js';
import {
  CalibrationRunStatus, type ICalibrationMeasurement, type ICalibrationRun,
} from '../../src/domain/calibration/calibration-run.js';
import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import type { IInstallationResourceState } from '../../src/domain/resources/installation-resources.js';
import { ADDON_PACKAGE_REGISTRY, ENABLE_SITE_ADDON } from '../../src/infra/addons/addons.tokens.js';
import type { IEnableSiteAddon } from '../../src/ports/inbound/addons/enable-site-addon.port.js';
import { account } from '../support/admin-users.js';
import { forkHarness } from '../support/fork-harness.js';

interface IRunDetail {
  run: ICalibrationRun;
  measurements: ICalibrationMeasurement[];
}

/** Opt-in: the app and mongo Compose services must be disposable, isolated QA containers. */
it('changes real Docker quotas for Events and Bloglist, applies and restores after cancel and generator failure',
  async () => {
    const project = process.env.ZARYA_TEST_DOCKER_PROJECT ?? '';
    const helper = process.env.ZARYA_TEST_DOCKER_HELPER_CONTAINER ?? '';
    const resourceSocket = process.env.ZARYA_RESOURCE_SOCKET ?? '';
    const secretFile = process.env.ZARYA_RESOURCE_SECRET_FILE ?? '';
    const events = process.env.ZARYA_TEST_EVENTS_ADDON_DIRECTORY;
    const bloglist = process.env.ZARYA_TEST_BLOGLIST_ADDON_DIRECTORY;

    if (
      process.platform !== 'linux'
    || !/^zarya-calibration-qa-[a-z0-9]+$/.test(project)
    || helper !== project + '-resource-control-1'
    || !resourceSocket
    || !secretFile
    || !events
    || !bloglist
    ) {
      throw new Error('Explicit disposable Docker calibration installation required');
    }

    const dockerSocket = '/var/run/docker.sock';
    const boundary = new DockerEngineResourceBoundary({
      dockerSocket, composeProject: project, overridePath: '/run/zarya/unused-observer.json',
    });
    const evidence: Record<string, unknown> = { cmsVersion: '0.15.0', realDocker: true };
    const f = await forkHarness({
      admin: true,
      listenPort: 3130,
      delivery: HtmlDelivery.Static,
      workerRunner: new URL('../../dist/infra/resources/site-worker.js', import.meta.url),
      runtimePackages: [events, bloglist],
      resourceSocket,
      resourceSecret: (await readFile(secretFile, 'utf8')).trim(),
      prepare: async (local, sites) => {
        const packages = local.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY);

        for (const [index, addonKey] of [[0, 'events'], [1, 'bloglist']] as const) {
          const registration = packages.registrations().find(row => row.definition.addonKey === addonKey);

          if (!registration?.defaultConfiguration) {
            throw new Error('Missing explicit runtime configuration');
          }
          await local.get<IEnableSiteAddon>(ENABLE_SITE_ADDON).execute({
            siteId: sites[index]!.siteId,
            addonKey,
            actorId: 'test',
            expectedVersion: null,
            configuration: registration.defaultConfiguration(),
          });
        }
      },
    });
    const headers: Record<string, string> = { Origin: f.origin, 'X-Zarya-Admin': '1' };
    const root = '/api/admin/installation/calibration';
    const ids = f.sites.map(site => site.siteId);

    async function api<T>(url: string, method = 'GET', body?: unknown, status = 200): Promise<T> {
      const reply = await fetch(f.origin + url, {
        method,
        headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      });

      expect(reply.status, await reply.clone().text()).toBe(status);

      const result: T = await reply.json();

      return result;
    }
    function allocation(state: IInstallationResourceState): unknown {
      return {
        databaseCpu: state.databaseCpu,
        cmsCpu: state.cmsCpu,
        sitePoolSize: state.databasePools?.sitePoolSize,
        sites: state.sites,
      };
    }
    async function healthy(): Promise<void> {
      for (const site of f.sites) {
        expect((await f.read(site.host)).status).toBe(200);
      }
    }
    async function actual(): Promise<{ databaseCpu: number | null; cmsCpu: number | null }> {
      const observed = await boundary.inspect();
      const [quota, period] = (await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim().split(/\s+/).map(Number);

      expect(quota! / period!).toBe(observed.cmsCpu);

      return { databaseCpu: observed.databaseCpu, cmsCpu: observed.cmsCpu };
    }
    async function restored(before: IInstallationResourceState): Promise<void> {
      const after = await f.supervisor.resources.read(ids);

      expect(allocation(after)).toEqual(allocation(before));
      expect(after.applyError).toBeNull();
      expect(after.databasePools?.appliedSitePoolSize).toBe(before.databasePools?.sitePoolSize);
      expect(await actual()).toEqual({ databaseCpu: before.databaseCpu, cmsCpu: before.cmsCpu });
      expect(after.running).toEqual(Object.fromEntries(before.sites.map(site => [site.siteId, site.processes])));
      await healthy();
    }
    async function profile(name: string, distributedCpu: number, slow = false): Promise<ICalibrationProfile> {
      const draft: ICalibrationProfileDraft = {
        name,
        scope: CalibrationScope.Installation,
        siteId: null,
        distributedCpu,
        targets: f.sites.map((site, index) => ({
          siteId: site.siteId,
          kind: CalibrationPageReferenceKind.RelativeUrl,
          reference: '/probe/',
          share: 5000,
          ...(index === 0 ? { apiSteps: [{ addonKey: 'events', queryId: 'sessions' }] } : {}),
        })),
        criteria: { averageMs: null, medianMs: null, p95Ms: 10000, p99Ms: null },
        search: {
          concurrencyLevels: [2],
          processCounts: slow ? [1] : [1, 2],
          poolSizes: slow ? [1] : [5],
          databaseCpuStep: 0.5,
          warmupSeconds: 1,
          probeSeconds: slow ? 20 : 2,
          confirmationSeconds: 2,
          maximumSeconds: slow ? 120 : 90,
        },
      };

      return api<ICalibrationProfile>(root + '/profiles', 'POST', draft, 201);
    }
    async function start(profile: ICalibrationProfile): Promise<ICalibrationRun> {
      return api(root + '/runs', 'POST', { profileId: profile.profileId, expectedVersion: profile.version }, 202);
    }
    async function finish(run: ICalibrationRun, status: CalibrationRunStatus): Promise<IRunDetail> {
      let detail: IRunDetail;

      await expect.poll(async () => {
        await healthy();
        detail = await api<IRunDetail>(root + '/runs/' + run.runId);

        return detail.run.status;
      }, { timeout: 150000, interval: 400 }).toBe(status);
      expect(detail!.run.restored).toBe(true);

      return detail!;
    }
    async function generator(kill: boolean): Promise<number> {
    // Run inside the helper's PID namespace; affect only its actual load worker.
      const script = `const fs=require('node:fs');let count=0;for(const pid of fs.readdirSync('/proc')){if(!/^\\d+$/.test(pid)||Number(pid)===process.pid)continue;try{const cmd=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');const stat=fs.readFileSync('/proc/'+pid+'/status','utf8');if(cmd.includes('/calibration-load.worker.js')&&/^PPid:\\s+1$/m.test(stat)){count++;if(${kill})process.kill(Number(pid),'SIGKILL');}}catch(error){if(error.code!=='ENOENT'&&error.code!=='ESRCH')throw error;}}fs.writeFileSync('/run/zarya/generator-count.json',JSON.stringify(count));`;
      const exec = resourceRecord(await localResourceExchange(dockerSocket, '/containers/' + helper + '/exec', 'POST', {
        Cmd: ['node', '-e', script], AttachStdout: false, AttachStderr: false,
      }));

      if (typeof exec.Id !== 'string') {
        throw new Error('Missing Docker execution identity');
      }

      await localResourceExchange(dockerSocket, '/exec/' + exec.Id + '/start', 'POST', { Detach: true });
      await expect.poll(async () => {
        const state = resourceRecord(await localResourceExchange(dockerSocket, '/exec/' + exec.Id + '/json', 'GET'));

        if (state.Running) {
          return false;
        }
        expect(state.ExitCode).toBe(0);

        return true;
      }, { timeout: 10000, interval: 50 }).toBe(true);

      const count: number = JSON.parse(await readFile('/run/zarya/generator-count.json', 'utf8'));

      return count;
    }
    async function runningWithChangedQuota(before: IInstallationResourceState): Promise<void> {
      await expect.poll(async () => {
        const observed = await actual();
        const state = await f.supervisor.resources.read(ids);

        return observed.cmsCpu !== before.cmsCpu
          && state.databasePools?.appliedSitePoolSize === 1
          && await generator(false) > 0;
      }, { timeout: 75000, interval: 200 }).toBe(true);
      evidence.changedBeforeInterruption = {
        ...await actual(),
        allocation: allocation(await f.supervisor.resources.read(ids)),
      };
    }

    try {
      const login = await fetch(f.origin + '/api/admin/auth/login', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account().profile().email, password: 'synthetic fork password' }),
      });

      expect(login.status).toBe(200);
      headers.Cookie = login.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
      await login.arrayBuffer();
      const initialState = await f.supervisor.resources.read(ids);

      await f.supervisor.resources.change({
        expectedVersion: initialState.version,
        databaseCpu: 1,
        cmsCpu: 5,
        sites: initialState.sites.map((site, index) => ({ ...site, processes: index === 0 ? 2 : 1 })),
        sitePoolSize: 10,
      });
      const original = await f.supervisor.resources.read(ids);

      expect(original.managed).toBe(true);
      expect(await actual()).toEqual({ databaseCpu: 1, cmsCpu: 5 });
      evidence.original = allocation(original);
      const completed = await finish(
        await start(await profile('Real Docker completion', 3)),
        CalibrationRunStatus.Completed,
      );
      const winner = completed.measurements.find(row => row.measurementId === completed.run.winnerId)!;

      expect(winner).toBeDefined();
      expect(winner.metrics.errors).toBe(0);
      expect(winner.metrics.requests).toBeGreaterThan(0);
      expect(Object.entries(winner.stepMetrics ?? {}).some(([key, value]) =>
        key.includes('/api/sessions?') && value.requests > 0 && value.errors === 0)).toBe(true);
      const addonKeys = completed.run.addonSnapshots?.flatMap(row => row.addons.map(addon => addon.addonKey)).sort();

      expect(addonKeys)
        .toEqual(['bloglist', 'events']);
      const measuredDatabaseQuotas = new Set(completed.measurements.map(row => row.observed.observedDatabaseCpu));

      expect(measuredDatabaseQuotas.size).toBeGreaterThan(1);

      for (const row of completed.measurements) {
        expect(row.observed.observedDatabaseCpu).toBe(row.configuration.databaseCpu);
        expect(row.observed.observedCmsCpu).toBe(row.configuration.cmsCpu);
      }
      await restored(original);
      const current = await f.supervisor.resources.read(ids);

      await api(root + '/runs/' + completed.run.runId + '/apply', 'POST', { expectedVersion: current.version });
      const applied = await f.supervisor.resources.read(ids);

      expect(allocation(applied)).toEqual(winner.configuration);
      expect(await actual()).toEqual({
        databaseCpu: winner.configuration.databaseCpu,
        cmsCpu: winner.configuration.cmsCpu,
      });
      const override: { services: { app: { cpus: number }; mongo: { cpus: number } } } =
        JSON.parse(await readFile('/run/zarya/compose.json', 'utf8'));

      expect(override.services.app.cpus).toBe(winner.configuration.cmsCpu);
      expect(override.services.mongo.cpus).toBe(winner.configuration.databaseCpu);
      evidence.completed = {
        status: completed.run.status,
        restored: completed.run.restored,
        measurements: completed.measurements,
      };
      evidence.applied = allocation(applied);
      const cancelledRun = await start(await profile('Real Docker cancellation', 4, true));

      await runningWithChangedQuota(applied);
      await api(root + '/runs/' + cancelledRun.runId + '/cancel', 'POST', {});
      const cancelled = await finish(cancelledRun, CalibrationRunStatus.Cancelled);

      await restored(applied);
      expect(await generator(false)).toBe(0);
      evidence.cancelled = { status: cancelled.run.status, restored: cancelled.run.restored, actual: await actual() };
      const failedRun = await start(await profile('Real Docker generator failure', 4, true));

      await runningWithChangedQuota(applied);
      expect(await generator(true)).toBe(1);
      const failed = await finish(failedRun, CalibrationRunStatus.Failed);

      expect(failed.run.error).toBeTruthy();
      expect(failed.run.winnerId).toBeNull();
      await restored(applied);
      expect(await generator(false)).toBe(0);
      evidence.failed = {
        status: failed.run.status,
        restored: failed.run.restored,
        error: failed.run.error,
        actual: await actual(),
      };
      const afterFailure = await f.supervisor.resources.read(ids);

      await f.supervisor.resources.change({
        expectedVersion: afterFailure.version,
        databaseCpu: original.databaseCpu,
        cmsCpu: original.cmsCpu,
        sites: original.sites,
        sitePoolSize: original.databasePools!.sitePoolSize,
      });
      await restored(original);
      evidence.final = await actual();
    } finally {
      try {
        await writeFile('/evidence/docker-calibration.json', JSON.stringify(evidence, null, 2) + '\n');
      } finally {
        await f.close();
      }
    }
  }, 360000);
