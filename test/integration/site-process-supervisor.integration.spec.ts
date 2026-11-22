import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';

import { createConnection } from 'mongoose';
import { chromium, type Page } from 'playwright-core';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import {
  DatabasePlacement, DumpExecutionMode, resolveDumpExecution,
} from '../../src/domain/resources/site-process-allocation.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { CONFIGURE_PAGE_RENDERING, PUBLISH_PAGE, PUBLISH_SITE_RELEASE, RELEASE_ACTIVATION } from
  '../../src/infra/publication/publication.tokens.js';
import { createProcessSupervisor } from '../../src/infra/resources/process-supervisor.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { verifyAdminSessionRecovery } from '../support/admin-session-recovery-browser.js';
import { account } from '../support/admin-users.js';
import { verifyResourceSettings } from '../support/resource-settings-browser.js';
import { runSiteProcessLoad } from '../support/site-process-load.js';
import { siteInput } from '../support/sites.js';

it('isolates published Request serving and creates site and installation dumps through real site pools',
  async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB required');
    }

    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');

    await mkdir('.tmp', { recursive: true });
    const root = await mkdtemp(path.resolve('.tmp/site-processes-'));
    const settings = {
      mongoUri,
      database,
      sourcesRoot: path.join(root, 'sites'),
      artifactsRoot: path.join(root, 'artifacts'),
      dumpsRoot: path.join(root, 'dumps'),
      host: '127.0.0.1',
      port: 0,
    };
    const connection = await createConnection(mongoUri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();
    let dumpBrowser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let local: Awaited<ReturnType<typeof createLocalApplication>> | undefined;
    let supervisor: Awaited<ReturnType<typeof createProcessSupervisor>> | undefined;

    try {
      await applyMigrations(connection, 'migrations');
      local = await createLocalApplication({
        ...settings,
        operator: { operatorId: 'test', platformAdministrator: true },
        rendering: settings,
      });
      const ids: string[] = [];

      for (const mark of ['One', 'Two']) {
        const site = await local.get<ICreateSite>(CREATE_SITE).execute({
          ...siteInput(),
          mark,
          primaryDomain: mark.toLowerCase() + '.test',
        });

        ids.push(site.siteId);
        const page = await local.get<ICreatePage>(CREATE_PAGE).execute({
          siteId: site.siteId,
          mark: 'Home',
          language: 'en',
          title: mark,
        });

        await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
          siteId: site.siteId,
          pageId: page.pageId,
          actorId: 'test',
          rendering: {
            templateId: 'ZaryaBasic',
            delivery: HtmlDelivery.Request,
            interaction: BrowserInteraction.None,
            parameters: {},
            loaders: [],
          },
        });
        await local.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
          siteId: site.siteId,
          pageId: page.pageId,
          mark: mark + 'ProbeUrl',
          parentUrlId: null,
          segment: 'probe',
          path: '/probe/',
        });
        await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: site.siteId, pageId: page.pageId });
        await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
          siteId: site.siteId,
          actorId: 'test',
          expectedActiveReleaseId: (await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION)
            .getActive(site.siteId))?.releaseId
            ?? null,
        });
      }
      await local.close();
      local = undefined;
      supervisor = await createProcessSupervisor(settings, {
        capacity: 6,
        infrastructureCpu: 0,
        databasePlacement: DatabasePlacement.ManagedLocal,
        workerRunner: new URL('../fixtures/site-process-worker.mjs', import.meta.url),
      });
      expect(supervisor.startupSites).toHaveLength(2);
      expect(supervisor.startupSites.map(site => site.siteId)).toEqual(expect.arrayContaining(ids));
      const state = await supervisor.resources.read(ids);

      await supervisor.resources.change({
        expectedVersion: state.version,
        databaseCpu: 1,
        sites: [{ siteId: ids[0]!, processes: 1 }, { siteId: ids[1]!, processes: 2 }],
      });
      const address = supervisor.server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Missing supervisor test address');
      }

      const read = (host: string): Promise<{ status: number; text(): Promise<string> }> =>
        new Promise((resolve, reject) => {
          const outgoing = request({
            hostname: '127.0.0.1',
            port: address.port,
            path: '/probe/',
            headers: { Host: host },
            agent: false,
          }, (incoming) => {
            let body = '';

            incoming.setEncoding('utf8');
            incoming.on('data', (chunk: string) => {
              body += chunk;
            });
            incoming.on('error', reject);
            incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, text: async () => body }));
          });

          outgoing.on('error', reject);
          outgoing.setTimeout(10000, () => outgoing.destroy(new Error('Test request timed out')));
          outgoing.end();
        });

      expect(await (await read('one.test')).text()).toContain('One');
      expect(await (await read('two.test')).text()).toContain('Two');
      expect((await read('unknown.test')).status).toBe(404);

      for (const blockedIndex of [0, 1]) {
        const state = await supervisor.resources.read(ids);

        await supervisor.resources.change({
          expectedVersion: state.version,
          databaseCpu: 1,
          sites: ids.map((siteId, index) => ({ siteId, processes: index === blockedIndex ? 1 : 2 })),
        });
        const blockedHost = blockedIndex === 0 ? 'one.test' : 'two.test';
        const neighborHost = blockedIndex === 0 ? 'two.test' : 'one.test';
        const worker = supervisor.pool.select(ids[blockedIndex]!);
        const freezing = new Promise<void>((resolve) => {
          const onMessage = (value: unknown): void => {
            if (value && typeof value === 'object' && 'kind' in value && value.kind === 'test-freezing') {
              worker.child.off('message', onMessage);
              resolve();
            }
          };

          worker.child.on('message', onMessage);
        });

        worker.child.send({ kind: 'test-freeze', durationMs: 1000 });
        const neighbors = async (): Promise<void> => {
          await freezing;
          const start = performance.now();

          for (let index = 0; index < 4; index++) {
            expect((await read(neighborHost)).status).toBe(200);
          }
          expect(performance.now() - start).toBeLessThan(900);
        };
        const [blocked] = await Promise.all([read(blockedHost), neighbors()]);

        expect(blocked.status).toBe(200);
        expect(supervisor.pool.running(ids[blockedIndex]!)).toBe(1);
        expect(supervisor.pool.running(ids[1 - blockedIndex]!)).toBe(2);
      }
      const reset = await supervisor.resources.read(ids);

      await supervisor.resources.change({
        expectedVersion: reset.version,
        databaseCpu: 1,
        sites: [{ siteId: ids[0]!, processes: 1 }, { siteId: ids[1]!, processes: 2 }],
      });
      await supervisor.close();
      supervisor = undefined;
      const password = 'synthetic cluster password';
      const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

      await new MongooseAdminUserStore(connection).run(async (work) => {
        await work.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
      });
      const origin = `http://127.0.0.1:${address.port}`;
      const operationId = randomUUID();
      const file = 'restore-recovery-check.txt';
      const stage = path.join(settings.sourcesRoot, '.installation-restore-' + operationId, 'before');
      const journal = path.join(settings.dumpsRoot, '.coordination', 'installation-restore.json');

      await mkdir(stage, { recursive: true });
      await mkdir(path.dirname(journal), { recursive: true });
      await writeFile(path.join(settings.sourcesRoot, file), 'Uncommitted');
      await writeFile(path.join(stage, file), 'Previous files');
      await writeFile(journal, JSON.stringify({
        operationId, entries: [{ area: 'sources', name: file, hadOriginal: true, hasNext: true }],
      }));
      supervisor = await createProcessSupervisor({
        ...settings, port: address.port, adminAuth: { origin }, adminRoot: path.resolve('admin/dist'),
      },
      {
        capacity: 6,
        infrastructureCpu: 0,
        databasePlacement: DatabasePlacement.ManagedLocal,
        workerRunner: new URL('../fixtures/site-process-worker.mjs', import.meta.url),
      });
      expect(await readFile(path.join(settings.sourcesRoot, file), 'utf8')).toBe('Previous files');
      await expect(readFile(journal)).rejects.toHaveProperty('code', 'ENOENT');
      const login = await fetch(origin + '/api/admin/auth/login', {
        method: 'POST',
        headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account().profile().email, password }),
      });

      expect(login.status).toBe(200);
      const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
      const headers = { Origin: origin, Cookie: cookie, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' };
      const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

      if (executablePath) {
        const browser = await chromium.launch({ executablePath, headless: true });

        try {
          const context = await browser.newContext();

          await context.request.post(origin + '/api/admin/auth/login', {
            data: {
              email: account().profile().email, password,
            },
            headers: { Origin: origin, 'X-Zarya-Admin': '1' },
          });
          const page = await context.newPage();
          let latestCpuSample = 0;
          let cpuSamples = 0;

          page.on('websocket', (socket) => {
            if (socket.url().endsWith('/api/admin/installation/cpu')) {
              socket.on('framereceived', () => {
                latestCpuSample = performance.now();
                cpuSamples++;
              });
            }
          });
          await page.clock.install();
          await page.goto(origin + '/admin/sites/' + ids[0] + '/settings');
          await page.locator('.admin-language select').selectOption('en');
          await page.getByRole('button', { name: 'General', exact: true }).click();
          await page.locator('.resource-settings:visible').waitFor();
          await page.getByRole('heading', { name: 'Resources', exact: true }).waitFor();
          await verifyResourceSettings(page);
          await verifyAdminSessionRecovery(page);

          for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576,
            767, 768, 991, 992, 1199, 1200, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          }
          expect(await page.locator('.cms-header').textContent()).toContain(`CMS Zarya v.${JSON.parse(await readFile('package.json', 'utf8')).version}`);
          await page.locator('._cluster-frame').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.resolve('.tmp/resources-0140-desktop.png'), fullPage: true });
          await page.getByRole('button', { name: 'CPU usage', exact: true }).click();
          await expect.poll(() => page.locator('._cpu-chart:visible').count()).toBeGreaterThan(0);
          const chart = page.locator('._cpu-chart').first();

          expect(await chart.locator('._cpu-scale span').allTextContents())
            .toEqual(['100%', '75%', '50%', '25%', '0%']);
          expect(await chart.locator('svg text').count()).toBe(0);
          expect(await chart.locator('._cpu-grid').getAttribute('d')).toContain('M0 75H299');
          await chart.scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.resolve('.tmp/resources-0140-cpu.png'), fullPage: true });

          if (process.env.ZARYA_TEST_PROCESS_LOAD === '1') {
            await runSiteProcessLoad({
              pool: supervisor.pool,
              resources: supervisor.resources,
              siteIds: ids,
              read,
              onFreeze: async () => {
                expect(performance.now() - latestCpuSample).toBeLessThan(2500);
                expect(cpuSamples).toBeGreaterThan(60);
                await page.locator('._cpu-chart').first().scrollIntoViewIfNeeded();
                await page.screenshot({ path: path.resolve('.tmp/resources-0140-freeze.png'), fullPage: true });
              },
            });
          }
          await page.setViewportSize({ width: 320, height: 1000 });
          await page.screenshot({ path: path.resolve('.tmp/resources-0140-mobile.png'), fullPage: true });
        } finally {
          await browser.close();
        }
      }

      dumpBrowser = executablePath ? await chromium.launch({ executablePath, headless: true }) : undefined;
      const dumpContext = await dumpBrowser?.newContext();

      if (dumpContext) {
        expect((await dumpContext.request.post(origin + '/api/admin/auth/login', {
          data: { email: account().profile().email, password },
          headers: { Origin: origin, 'X-Zarya-Admin': '1' },
        })).ok()).toBe(true);
      }

      const jobsRoot = path.join(settings.dumpsRoot, '.capture-jobs');
      const listCaptureJobs = (): Promise<string[]> => readdir(jobsRoot).catch((error: unknown) => {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
          throw error;
        }

        return [];
      });
      const openDumps = async (siteId: string): Promise<Page | undefined> => {
        const page = await dumpContext?.newPage();

        if (page) {
          await page.goto(origin + '/admin/sites/' + siteId + '/settings');
          await page.locator('.admin-language select').selectOption('en');
          await page.getByRole('button', { name: 'Dumps', exact: true }).click();
          await page.getByRole('button', { name: 'Create dump', exact: true }).waitFor();
        }

        return page;
      };
      const dump = async (siteId: string, type = 'Site', prepared?: Page): Promise<void> => {
        const page = prepared ?? await openDumps(siteId);
        const endpoint = origin + '/api/admin/sites/' + siteId + '/dumps/'
          + (type === 'Site' ? 'create' : 'installation/create');
        const mode = resolveDumpExecution(await supervisor!.resources.read(ids), siteId);
        const requesters = new Set(Array.from({ length: supervisor!.pool.running(siteId) },
          () => supervisor!.pool.select(siteId).child.pid));
        let observedChild = false;
        let done = false;
        let served = 0;
        const capture = (async () => {
          try {
            if (page) {
              const [result] = await Promise.all([
                page.waitForResponse((response) => response.url() === endpoint
                  && response.request().method() === 'POST', { timeout: 45000 }),
                page.getByRole('button', {
                  name: type === 'Site' ? 'Create dump' : 'Create installation dump', exact: true,
                }).click(),
              ]);

              expect(result.status(), await result.text()).toBe(201);
              expect(await result.json()).toMatchObject({ type });
            } else {
              const result = await fetch(endpoint,
                { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(30000) });
              const body: unknown = await result.json();

              expect(result.status, JSON.stringify(body)).toBe(201);
              expect(body).toMatchObject({ type });
            }
          } finally {
            done = true;
          }
        })();
        const traffic = (async () => {
          while (!done) {
            for (const job of await listCaptureJobs()) {
              const text = await readFile(path.join(jobsRoot, job, '.lease.json'), 'utf8').catch((error: unknown) => {
                if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
                  throw error;
                }

                return null;
              });

              if (text) {
                const lease: unknown = JSON.parse(text);

                expect(lease).toMatchObject({ parentPid: process.pid, siteId });

                if (lease && typeof lease === 'object' && 'operationOwnerPid' in lease) {
                  expect(requesters.has(Number(lease.operationOwnerPid))).toBe(true);
                  observedChild = true;
                }
              }
            }
            const result = await read('two.test');

            expect([200, 503], await result.text()).toContain(result.status);

            if (result.status === 200) {
              expect(await result.text()).toContain('Two');
              served++;
            }
          }
        })();

        await Promise.all([capture, traffic]);
        await page?.close();
        expect(served).toBeGreaterThan(0);
        expect(observedChild).toBe(mode !== DumpExecutionMode.InProcess);
        expect(await listCaptureJobs()).toEqual([]);
      };
      const aBefore = supervisor.pool.select(ids[0]!).id;
      const otherWriter = supervisor.pool.select(ids[1]!);
      const held = new Promise<void>((resolve) => {
        const message = (value: unknown): void => {
          if (value && typeof value === 'object' && 'kind' in value && value.kind === 'test-write-held') {
            otherWriter.child.off('message', message);
            resolve();
          }
        };

        otherWriter.child.on('message', message);
      });
      const pageForHeldWrite = await openDumps(ids[0]!);

      otherWriter.child.send({ kind: 'test-hold-write' });
      await held;
      let completed = false;
      const capture = dump(ids[0]!, 'Site', pageForHeldWrite).finally(() => {
        completed = true;
      });
      const coordinated = async (): Promise<void> => {
        try {
          await expect.poll(async () => {
            const value: unknown = JSON.parse(await readFile(path.join(settings.dumpsRoot,
              '.coordination/processes/maintenance/state.json'), 'utf8'));

            return value && typeof value === 'object' && 'owner' in value && value.owner !== null;
          }, { timeout: 10000 }).toBe(true);
          expect(completed).toBe(false);
          const blockedWrite = await fetch(origin + '/api/admin/installation/resources', {
            method: 'POST', headers, body: '{}',
          });

          expect(blockedWrite.status).toBe(503);
        } finally {
          otherWriter.child.send({ kind: 'test-release-write' });
        }
      };

      await Promise.all([capture, coordinated()]);
      expect(supervisor.pool.select(ids[0]!).id).toBe(aBefore);
      const bBefore = new Set([supervisor.pool.select(ids[1]!).id, supervisor.pool.select(ids[1]!).id]);

      await dump(ids[1]!);
      const bAfter = [supervisor.pool.select(ids[1]!).id, supervisor.pool.select(ids[1]!).id];

      expect(bAfter.filter((id) => !bBefore.has(id))).toHaveLength(1);
      await dump(ids[1]!, 'Installation');
      const bAfterInstallation = [supervisor.pool.select(ids[1]!).id, supervisor.pool.select(ids[1]!).id];

      expect(bAfterInstallation.filter((id) => !bAfter.includes(id))).toHaveLength(1);
      const beforeInline = await supervisor.resources.read(ids);

      await supervisor.resources.change({
        expectedVersion: beforeInline.version,
        databaseCpu: 1,
        sites: [{ siteId: ids[0]!, processes: 1 }, { siteId: ids[1]!, processes: 4 }],
      });
      await dump(ids[0]!);
      expect(supervisor.pool.select(ids[0]!).id).toBe(aBefore);
      await dump(ids[0]!, 'Installation');
      expect(supervisor.pool.select(ids[0]!).id).toBe(aBefore);
      const forbidden = await fetch(origin + '/api/admin/sites/' + ids[0] + '/dumps/create', {
        method: 'POST',
        headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(forbidden.status).toBe(401);
      const earlyRejection = await new Promise<number>((resolve, reject) => {
        const outgoing = request(origin + '/api/admin/installation/resources', {
          method: 'POST',
          headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Length': '500000' },
        }, (incoming) => {
          incoming.resume();
          resolve(incoming.statusCode ?? 0);
          outgoing.destroy();
        });

        outgoing.on('error', reject);
        outgoing.setTimeout(2000, () => outgoing.destroy(new Error('Unauthorized body was awaited')));
        outgoing.flushHeaders();
      });

      expect(earlyRejection).toBe(401);
    } finally {
      await dumpBrowser?.close();
      await supervisor?.close();
      await local?.close();

      expect(connection.name).toBe(database);
      expect(database).toMatch(/^zarya_test_[a-f0-9]{32}$/);
      await connection.dropDatabase();
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  }, process.env.ZARYA_TEST_PROCESS_LOAD === '1' ? 240000 : 120000);
