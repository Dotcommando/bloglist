import 'reflect-metadata';

import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';

import { createConnection } from 'mongoose';
import { type Browser, chromium, type Page } from 'playwright-core';
import { expect, it, type Mock, vi } from 'vitest';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { packAddonArchive } from '../../src/adapters/outbound/runtime/addons/addon-package-archive.js';
import { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import { ScryptAdminPasswordAdapter }
  from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AddonInstallationStatus } from '../../src/domain/addons/addon-installation.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { BuiltInRoleId } from '../../src/domain/authorization/built-in-roles.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';
import { ADDON_INSTALLATION_STORE } from '../../src/infra/addons/addon-installation.tokens.js';
import { ADDON_PACKAGE_REGISTRY, ENABLE_SITE_ADDON } from '../../src/infra/addons/addons.tokens.js';
import { ADMIN_USER_UNIT_OF_WORK } from '../../src/infra/admin-users/admin-users.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { CONFIGURE_PAGE_RENDERING, PUBLISH_PAGE, PUBLISH_SITE_RELEASE, RELEASE_ACTIVATION }
  from '../../src/infra/publication/publication.tokens.js';
import { createProcessSupervisor } from '../../src/infra/resources/process-supervisor.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IEnableSiteAddon } from '../../src/ports/inbound/addons/enable-site-addon.port.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IAddonInstallationStore } from '../../src/ports/outbound/addons/addon-installation-store.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../src/ports/outbound/admin-users/admin-user-store.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { account } from '../support/admin-users.js';
import { siteInput } from '../support/sites.js';

function stubGitHubRelease(version: string, archiveBytes: Buffer):
Mock<(url: string, init?: RequestInit) => Promise<Response>> {
  const nativeFetch = globalThis.fetch;
  const gitHubRequests = vi.fn(async (url: string, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get('Authorization');
    const repository = 'https://api.github.com/repos/zarya/synthetic';

    if (url === repository + '/installation') {
      expect(authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);

      return Response.json({ id: 173, account: { login: 'Zarya' }, suspended_at: null });
    }
    if (url === 'https://api.github.com/app/installations/173/access_tokens') {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        repositories: ['synthetic'], permissions: { contents: 'read' },
      });

      return Response.json({ token: 'ghs_isolated_fixture' }, { status: 201 });
    }
    if (authorization !== 'Bearer ghs_isolated_fixture') {
      return new Response(null, { status: 404 });
    }
    if (url.endsWith('/releases/latest')) {
      return Response.json({
        draft: false,
        prerelease: false,
        tag_name: 'v' + version,
        assets: [{ name: 'addon.runtime.gz', state: 'uploaded', id: 123, size: archiveBytes.length }],
      });
    }
    if (url.endsWith('/commits/v' + version)) {
      return Response.json({ sha: 'a'.repeat(40) });
    }
    if (url.endsWith('/releases/assets/123')) {
      return new Response(new Uint8Array(archiveBytes));
    }

    return new Response(null, { status: 404 });
  });

  vi.stubGlobal('fetch', (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    typeof input === 'string' && input.startsWith('https://api.github.com/') ? gitHubRequests(input, init)
      : nativeFetch(input, init));

  return gitHubRequests;
}

it.each([
  { mode: 'Exclusive', version: '0.3.0', hung: true, repairVersion: null, repository: false },
  { mode: 'Compatible', version: '0.2.1', hung: false, repairVersion: null, repository: false },
  { mode: 'Exclusive', version: '0.3.1', hung: false, repairVersion: '0.3.2', repository: false },
  { mode: 'Compatible', version: '0.2.1', hung: false, repairVersion: null, repository: true },
])('updates Synthetic $mode $version schema with available pages (repository: $repository)', async scenario => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;
  const packagesRoot = process.env.ZARYA_TEST_SYNTHETIC_PACKAGES;

  if (!mongoUri || !packagesRoot) {
    throw new Error('Explicit isolated MongoDB and prebuilt Synthetic packages are required');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');

  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/live-update-'));
  const connection = await createConnection(mongoUri, {
    dbName: database, autoIndex: false, autoCreate: false,
  }).asPromise();
  let local: Awaited<ReturnType<typeof createLocalApplication>> | undefined;
  let supervisor: Awaited<ReturnType<typeof createProcessSupervisor>> | undefined;
  let browser: Browser | undefined;
  let updatePage: Page | undefined;

  async function cleanup(): Promise<void> {
    vi.unstubAllGlobals();
    const stopped = await Promise.allSettled([browser?.close(), supervisor?.close(), local?.close()]);
    const dropped = await Promise.allSettled([connection.dropDatabase()]);
    const cleaned = await Promise.allSettled([connection.close(), rm(root, { recursive: true, force: true })]);
    const failed = [...stopped, ...dropped, ...cleaned].filter(result => result.status === 'rejected');

    if (failed.length) {
      throw new AggregateError(failed.map(result => result.reason), 'Live-update test cleanup failed');
    }
  }

  try {
    await applyMigrations(connection, 'migrations');
    const probe = createServer();

    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('No probe port');
    }
    await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    const base = 'http://127.0.0.1:' + address.port;
    const keysDirectory = path.join(root, 'private-keys');

    if (scenario.repository) {
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

      await mkdir(keysDirectory);
      await writeFile(path.join(keysDirectory, 'generated key.pem'),
        privateKey.export({ type: 'pkcs8', format: 'pem' }));
    }

    const settings = {
      ...(scenario.repository ? { githubApp: { clientId: 'Iv23Fixture', keysDirectory } } : {}),
      mongoUri,
      database,
      host: '127.0.0.1',
      port: address.port,
      sourcesRoot: path.join(root, 'sources'),
      artifactsRoot: path.join(root, 'artifacts'),
      dumpsRoot: path.join(root, 'dumps'),
      adminRoot: path.resolve('admin/dist'),
      adminAuth: { origin: base },
    };

    local = await createLocalApplication({
      ...settings,
      rendering: settings,
      operator: { operatorId: 'test', platformAdministrator: true },
    });
    const site = await local.get<ICreateSite>(CREATE_SITE).execute({ ...siteInput(), primaryDomain: '127.0.0.1' });
    const siteId = site.siteId;
    const otherSite = scenario.repository ? await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'OtherSite', name: 'Other site', primaryDomain: 'other-update.example.test',
    }) : undefined;
    const page = await local.get<ICreatePage>(CREATE_PAGE).execute({
      siteId, mark: 'Home', language: 'en', title: 'Available',
    });

    await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId,
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
      siteId,
      pageId: page.pageId,
      mark: 'Probe',
      parentUrlId: null,
      segment: 'probe',
      path: '/probe/',
    });
    await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId: page.pageId });
    await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId,
      actorId: 'test',
      expectedActiveReleaseId: (await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION)
        .getActive(siteId))?.releaseId ?? null,
    });
    const password = 'synthetic-test-password';
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

    await local.get<IAdminUserUnitOfWorkPort>(ADMIN_USER_UNIT_OF_WORK).run(async users => {
      await users.save(new AdminUser({ ...account().toState(), passwordDigest }), null);

      if (scenario.repository) {
        await users.save(new AdminUser({ ...account('site-admin').toState(), passwordDigest }), null, undefined, {
          roleId: BuiltInRoleId.SiteAdmin, siteId, grantedBy: 'user-1',
        });
        await users.save(new AdminUser({ ...account('update-manager').toState(), passwordDigest }), null, undefined, {
          roleId: BuiltInRoleId.Manager, siteId, grantedBy: 'user-1',
        });
      }
    });
    const registry = local.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY);

    await registry.install(path.join(packagesRoot, 'synthetic-0.2.0'));

    if (scenario.repository) {
      const runtime = registry.runtime('synthetic')!;
      const at = new Date();

      await local.get<IAddonInstallationStore>(ADDON_INSTALLATION_STORE).reserve({
        installationId: randomUUID(),
        addonKey: 'synthetic',
        status: AddonInstallationStatus.Installed,
        repositoryUrl: 'https://github.com/zarya/synthetic',
        releaseTag: 'v0.2.0',
        sourceCommit: 'b'.repeat(40),
        artifactChecksum: 'c'.repeat(64),
        runtimeDigest: runtime.digest,
        implementationVersion: '0.2.0',
        cmsVersion: '0.16.0',
        createdAt: at,
        installedAt: at,
        installedBy: 'user-1',
      });
    }
    await local.get<IEnableSiteAddon>(ENABLE_SITE_ADDON).execute({
      siteId,
      addonKey: 'synthetic',
      actorId: 'test',
      expectedVersion: null,
      configuration: { schemaVersion: 1, values: {} },
    });

    if (otherSite) {
      await local.get<IEnableSiteAddon>(ENABLE_SITE_ADDON).execute({
        siteId: otherSite.siteId,
        addonKey: 'synthetic',
        actorId: 'test',
        expectedVersion: null,
        configuration: { schemaVersion: 1, values: {} },
      });
    }
    await local.close();
    local = undefined;
    const archive = path.join(root, 'addon.runtime.gz');

    await packAddonArchive(path.join(packagesRoot, 'synthetic-' + scenario.version), archive);
    const gitHubRequests = scenario.repository ? stubGitHubRelease(scenario.version, await readFile(archive)) : null;

    supervisor = await createProcessSupervisor(settings, {
      capacity: 4,
      infrastructureCpu: 0,
      cmsCpuBudget: 4,
      databasePlacement: DatabasePlacement.UnmanagedLocal,
    });
    const login = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user-1@example.test', password }),
    });

    expect(login.status).toBe(200);
    const cookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? '';

    await login.arrayBuffer();
    const headers = { Cookie: cookie, Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' };
    const endpoint = base + '/api/admin/sites/' + siteId + '/synthetic';
    const put = await fetch(endpoint + '/records/first', {
      method: 'POST',
      headers,
      body: JSON.stringify({ value: 'preserved', expectedVersion: null }),
    });

    expect(put.status).toBe(200);
    const original: unknown = await put.json();
    const initialStatus = await fetch(endpoint + '/status', { headers }).then(response => response.json());

    expect(initialStatus).toMatchObject({ schema: 'Base', version: '0.2.0' });
    expect(initialStatus.pid).not.toBe(process.pid);

    const siteConnections = connection.db!
      .collection<{ siteId: string; addonKey: string; version: string }>('site_addons');
    const getConnections = (): Promise<unknown[]> =>
      siteConnections.find({ addonKey: 'synthetic' }).sort({ siteId: 1 }).toArray();
    const otherEndpoint = otherSite ? base + '/api/admin/sites/' + otherSite.siteId + '/synthetic' : undefined;

    if (otherSite && otherEndpoint) {
      const otherRecord = await fetch(otherEndpoint + '/records/second', {
        method: 'POST', headers, body: JSON.stringify({ value: 'other site record', expectedVersion: null }),
      });

      expect(otherRecord.status, await otherRecord.text()).toBe(200);
      const otherConnection = await siteConnections.findOne({ siteId: otherSite.siteId, addonKey: 'synthetic' });
      const disabled = await fetch(base + '/api/admin/sites/' + otherSite.siteId + '/addons/synthetic/disable', {
        method: 'POST', headers, body: JSON.stringify({ expectedVersion: otherConnection?.version }),
      });

      expect(disabled.status, await disabled.text()).toBe(200);
    }

    const connectionsBeforeApply = otherSite ? await getConnections() : [];
    const otherRecordFilter = { siteId: otherSite?.siteId, recordId: 'second' };
    const records = connection.db!.collection('synthetic_records');
    const otherRecordBeforeApply = otherSite ? await records.findOne(otherRecordFilter) : null;

    if (otherSite) {
      expect(otherRecordBeforeApply).toMatchObject({ value: 'other site record' });
    }
    if (scenario.repairVersion) {
      const duplicate = await fetch(endpoint + '/records/duplicate', {
        method: 'POST', headers, body: JSON.stringify({ value: 'preserved', expectedVersion: null }),
      });

      expect(duplicate.status).toBe(200);
      await duplicate.arrayBuffer();
    }
    if (scenario.hung) {
      const hang = await fetch(endpoint + '/hang-shutdown', { method: 'POST', headers });

      expect(hang.status).toBe(200);
      await hang.arrayBuffer();
    }
    if (scenario.mode === 'Compatible') {
      const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

      if (!executablePath) {
        throw new Error('Explicit test browser required');
      }
      browser = await chromium.launch({
        executablePath,
        headless: true,
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const separator = cookie.indexOf('=');

      await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: base }]);
      updatePage = await context.newPage();
      await updatePage.goto(base + '/admin/sites/' + siteId + '/addons');

      if (!scenario.repository) {
        const card = updatePage.getByRole('article').filter({ hasText: 'Synthetic' });

        await card.getByRole('button', { name: 'Update from file', exact: true }).click();
        await card.locator('#addon-update-archive-synthetic').setInputFiles(archive);
      }
    }

    let proposal: { updateId: string; fromDigest: string; toDigest: string };

    if (gitHubRequests) {
      const restricted = await browser!.newContext();
      const login = await restricted.request.post(base + '/api/admin/auth/login', {
        headers: { Origin: base, 'X-Zarya-Admin': '1' },
        data: { email: 'site-admin@example.test', password },
      });

      expect(login.status()).toBe(200);
      const restrictedPage = await restricted.newPage();

      await restrictedPage.goto(base + '/admin/sites/' + siteId + '/addons');
      await restrictedPage.getByRole('article').filter({ hasText: 'Synthetic' }).waitFor();
      expect(await restrictedPage.getByRole('button', { name: 'Check for updates' }).count()).toBe(0);
      const checkUrl = base + '/api/admin/addon-updates/repository/synthetic';
      const denied = await restrictedPage.request.post(checkUrl, {
        headers: { Origin: base, 'X-Zarya-Admin': '1' },
      });

      expect(denied.status()).toBe(403);
      expect(gitHubRequests).not.toHaveBeenCalled();
      await restricted.close();

      const missingSource = await updatePage!.request.post(checkUrl.replace(/synthetic$/, 'unlinked'), {
        headers: { Origin: base, 'X-Zarya-Admin': '1' },
      });

      expect(await missingSource.json()).toEqual({ status: 'NoRepository' });
      expect(gitHubRequests).not.toHaveBeenCalled();
      const card = updatePage!.getByRole('article').filter({ hasText: 'Synthetic' });
      const check = card.getByRole('button', { name: 'Check for updates', exact: true });
      const settingsButton = card.getByRole('button', { name: 'Settings', exact: true });

      await check.waitFor();
      expect((await check.boundingBox())!.x).toBeLessThan((await settingsButton.boundingBox())!.x);
      gitHubRequests.mockResolvedValueOnce(new Response(null, { status: 503 }));
      await check.click();
      await card.getByText('Could not check for an update. Try again.', { exact: true }).waitFor();
      expect(await card.getByRole('button', { name: 'Install update', exact: true }).count()).toBe(0);

      const [checked] = await Promise.all([
        updatePage!.waitForResponse(response => response.url() === checkUrl && response.request().method() === 'POST'),
        check.click(),
      ]);

      expect(checked.status()).toBe(200);
      const result = await checked.json();

      expect(result).toMatchObject({
        status: 'Available', update: { mode: scenario.mode, fromVersion: '0.2.0', toVersion: scenario.version },
      });
      proposal = result.update;
      const availableVersion = 'Version 0.2.0. Version available ' + scenario.version;

      await card.getByText(availableVersion, { exact: false }).waitFor();
      await card.getByRole('button', { name: 'Install update', exact: true }).waitFor();
      const beforeApply = await fetch(endpoint + '/status', { headers });

      expect(await beforeApply.json()).toMatchObject({ version: '0.2.0' });
      expect(await getConnections()).toEqual(connectionsBeforeApply);
      expect(connectionsBeforeApply).toEqual(expect.arrayContaining([
        expect.objectContaining({ siteId, status: 'Enabled' }),
        expect.objectContaining({ siteId: otherSite?.siteId, status: 'Disabled' }),
      ]));

      const updateUrl = base + '/api/admin/addon-updates';
      const statusUrl = updateUrl + '/' + proposal.updateId;
      const gitHubCalls = gitHubRequests.mock.calls.length;
      const adminHeaders = { Origin: base, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' };

      for (const email of ['site-admin@example.test', 'update-manager@example.test']) {
        const login = await fetch(base + '/api/admin/auth/login', {
          method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password }),
        });

        expect(login.status).toBe(200);
        const session = login.headers.get('set-cookie')!.split(';')[0]!;

        await login.arrayBuffer();
        const restrictedHeaders = { ...adminHeaders, Cookie: session };

        for (const [url, method] of [[checkUrl, 'POST'], [statusUrl, 'GET'], [statusUrl + '/apply', 'POST']] as const) {
          const denied = await fetch(url, { method, headers: restrictedHeaders });

          expect(denied.status, await denied.text()).toBe(403);
        }

        const beforeBody = await new Promise<number | undefined>((resolve, reject) => {
          const upload = httpRequest(updateUrl, {
            method: 'POST',
            headers: { ...restrictedHeaders, 'Content-Type': 'application/gzip', 'Content-Length': 1 },
          }, (response) => {
            response.resume();
            resolve(response.statusCode);
          });

          upload.on('error', reject);
          upload.setTimeout(5000, () => upload.destroy(new Error('Update authorization waited for an upload body')));
          upload.flushHeaders();
        });

        expect(beforeBody).toBe(403);
      }

      expect(gitHubRequests).toHaveBeenCalledTimes(gitHubCalls);
      const status = await fetch(statusUrl, { headers });

      expect(status.status).toBe(200);
      expect(await status.json()).toEqual(proposal);
      expect(await getConnections()).toEqual(connectionsBeforeApply);
    } else {
      const upload = await fetch(base + '/api/admin/addon-updates', {
        method: 'POST',
        headers: {
          ...headers, 'Content-Type': 'application/gzip', 'Content-Length': String((await stat(archive)).size),
        },
        body: await openAsBlob(archive, { type: 'application/gzip' }),
      });

      expect(upload.status).toBe(200);
      proposal = await upload.json();
      expect(proposal).toMatchObject({ mode: scenario.mode, fromVersion: '0.2.0', toVersion: scenario.version });
    }
    if (updatePage && !scenario.repository) {
      const endpoint = base + '/api/admin/addon-updates';
      let checkedPackage: unknown;

      // Read the live upload response before Chromium can evict the body from its inspector cache.
      await updatePage.route(endpoint, async (route) => {
        const response = await route.fetch();

        checkedPackage = await response.json();
        await route.fulfill({ response });
      }, { times: 1 });
      const checked = updatePage.waitForResponse(response =>
        response.url() === endpoint && response.request().method() === 'POST');
      const checkedObserved = Promise.allSettled([checked]);

      try {
        await updatePage.getByRole('button', { name: 'Check package', exact: true }).click();
        const checkedResponse = await checked;

        expect(checkedResponse.status()).toBe(200);
        Object.assign(proposal, checkedPackage);
        await updatePage.getByText('This update applies to all sites in this installation.', { exact: true }).waitFor();
        await updatePage.screenshot({ path: '.tmp/addon-update-desktop.png', fullPage: true });
        await updatePage.setViewportSize({ width: 390, height: 844 });
        expect(await updatePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await updatePage.screenshot({ path: '.tmp/addon-update-mobile.png', fullPage: true });
        await updatePage.setViewportSize({ width: 1280, height: 900 });
      } finally {
        await checkedObserved;
      }
    }

    const applyFromBrowser = async (page: Page): Promise<Response> => {
      const pending = page.waitForResponse(response => response.url().endsWith('/' + proposal.updateId + '/apply'),
        { timeout: 120000 });
      const observed = Promise.allSettled([pending]);

      try {
        await page.getByRole('button', { name: 'Install update', exact: true }).click();
        const response = await pending;
        const status = await fetch(base + '/api/admin/addon-updates/' + proposal.updateId, { headers });

        return new Response(await status.text(), { status: response.status() });
      } finally {
        await observed;
      }
    };
    const started = Date.now();
    const available: number[] = [];
    const addonStatuses: number[] = [];
    const receipts = 'addon_' + AddonPackageRegistry.migrationOwner('synthetic').replaceAll('-', '_') + '_migrations';
    const apply = (id: string): Promise<Response> => fetch(base + '/api/admin/addon-updates/' + id + '/apply', {
      method: 'POST', headers: { Cookie: cookie, Origin: base, 'X-Zarya-Admin': '1' },
    });

    async function observeApply(operation: Promise<Response>): Promise<Response> {
      let finished = false;
      const applying = operation.finally(() => {
        finished = true;
      });
      const observed = Promise.allSettled([applying]);

      try {
        while (!finished) {
          const published = await fetch(base + '/probe/');

          available.push(published.status);
          await published.arrayBuffer();
          expect(published.status).toBe(200);
          const status = await fetch(endpoint + '/status', { headers });

          addonStatuses.push(status.status);
          await status.arrayBuffer();
          expect(status.status === 200 || scenario.mode === 'Exclusive' && status.status === 503).toBe(true);
          await new Promise<void>(resolve => setTimeout(resolve, 50));
        }

        return await applying;
      } finally {
        await observed;
      }
    }
    async function recoverRepositoryUpdate(page: Page): Promise<Response> {
      const statusUrl = base + '/api/admin/addon-updates/' + proposal.updateId;
      let commit!: () => void;
      let failCommit!: (error: unknown) => void;
      const committed = new Promise<void>((resolve, reject) => {
        commit = resolve;
        failCommit = reject;
      });
      const commits = vi.fn();

      await page.route(statusUrl + '/apply', async (route) => {
        commits();

        try {
          const response = await route.fetch({ timeout: 120000 });

          expect(response.status(), await response.text()).toBe(200);
          await route.abort('connectionreset');
          commit();
        } catch (error) {
          failCommit(error);
          await route.abort();
        }
      });
      await page.route(statusUrl, (route) => route.abort('connectionreset'), { times: 1 });

      try {
        await Promise.all([
          page.getByRole('button', { name: 'Install update', exact: true }).click(),
          committed,
        ]);
        await page.getByText('Could not complete the update. Try installing again or refresh the list.', {
          exact: true,
        }).waitFor();
        const [restored] = await Promise.all([
          page.waitForResponse((response) => response.url() === statusUrl && response.request().method() === 'GET'),
          page.reload(),
        ]);
        const result = await restored.text();

        expect(restored.status()).toBe(200);
        expect(JSON.parse(result)).toMatchObject({ updateId: proposal.updateId, phase: 'Completed' });
        await page.waitForFunction(() => localStorage.getItem('zarya-addon-update') === null);
        const card = page.getByRole('article').filter({ hasText: 'Synthetic' });

        await card.getByText('Version 0.2.1', { exact: true }).waitFor();
        expect(await page.getByRole('status').filter({ hasText: 'Status: Completed' }).count()).toBe(0);
        expect(await card.getByRole('button', { name: 'Install update', exact: true }).count()).toBe(0);
        expect(commits).toHaveBeenCalledTimes(1);

        return new Response(result, { status: restored.status() });
      } finally {
        await page.unroute(statusUrl + '/apply');
        await page.unroute(statusUrl);
      }
    }

    let applied = await observeApply(updatePage
      ? scenario.repository ? recoverRepositoryUpdate(updatePage) : applyFromBrowser(updatePage)
      : apply(proposal.updateId));

    if (scenario.repository) {
      const card = updatePage!.getByRole('article').filter({ hasText: 'Synthetic' });

      await card.getByText('Version ' + scenario.version, { exact: false }).waitFor();
      await card.getByRole('button', { name: 'Check for updates', exact: true }).click();
      await card.getByText('The installed version is up to date.', { exact: true }).waitFor();
      expect(await card.getByRole('button', { name: 'Install update', exact: true }).count()).toBe(0);
      expect(await getConnections()).toEqual(connectionsBeforeApply);
      expect(await records.findOne(otherRecordFilter)).toEqual(otherRecordBeforeApply);
      await updatePage!.goto(base + '/admin/sites/' + otherSite!.siteId + '/addons');
      await card.getByText('Version ' + scenario.version, { exact: false }).waitFor();
      await card.getByText('Disabled', { exact: true }).waitFor();
    }

    let completedId = proposal.updateId;
    let retainedReceipts: unknown[] = [];

    if (scenario.repairVersion) {
      expect(applied.status).toBe(500);
      await applied.arrayBuffer();
      const failedStatus = await fetch(base + '/api/admin/addon-updates/' + proposal.updateId, { headers });

      expect(failedStatus.status).toBe(200);
      const failed = await failedStatus.json();

      expect(failed).toMatchObject({ phase: 'Failed', paused: true, toVersion: '0.3.1' });
      expect(JSON.parse(await readFile(path.join(settings.dumpsRoot, '.installed-addons/synthetic.json'), 'utf8')))
        .toMatchObject({ digest: proposal.fromDigest });
      const documents = await connection.db!.collection('synthetic_records').find({ siteId }).toArray();

      expect(documents).toHaveLength(2);
      expect(documents.every(document =>
        document.value === 'preserved' && document.displayValue === 'preserved')).toBe(true);
      retainedReceipts = await connection.db!.collection(receipts).find({}).sort({ _id: 1 }).toArray();
      expect(retainedReceipts).toHaveLength(2);
      expect(retainedReceipts).toEqual([
        expect.objectContaining({ _id: '0000-runtime' }),
        expect.objectContaining({ _id: '0001-display-value' }),
      ]);
      expect((await connection.db!.collection('synthetic_records').indexes())
        .some(index => index.name === 'site_value')).toBe(false);
      // Prove that a fresh process can bootstrap the paused, partly migrated add-on.
      await supervisor.restartAddon('synthetic');

      for (let attempt = 0; attempt < 3; attempt++) {
        const publicPage = await fetch(base + '/probe/');

        expect(publicPage.status).toBe(200);
        await publicPage.arrayBuffer();
        const blocked = await fetch(endpoint + '/records/blocked', {
          method: 'POST', headers, body: JSON.stringify({ value: 'blocked', expectedVersion: null }),
        });

        expect(blocked.status).toBe(503);
        await blocked.arrayBuffer();
      }
      expect(await connection.db!.collection('synthetic_records').countDocuments({ siteId })).toBe(2);
      const repairArchive = path.join(root, 'repair.runtime.gz');

      await packAddonArchive(path.join(packagesRoot, 'synthetic-' + scenario.repairVersion), repairArchive);
      const repairUpload = await fetch(base + '/api/admin/addon-updates', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/gzip',
          'Content-Length': String((await stat(repairArchive)).size),
        },
        body: await openAsBlob(repairArchive, { type: 'application/gzip' }),
      });

      expect(repairUpload.status).toBe(200);
      const repair = await repairUpload.json();

      expect(repair).toMatchObject({ mode: 'Exclusive', fromVersion: '0.2.0', toVersion: scenario.repairVersion });
      completedId = repair.updateId;
      applied = await observeApply(apply(completedId));
    }
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({
      phase: 'Completed',
      paused: false,
      toVersion: scenario.repairVersion ?? scenario.version,
      forcedProcessCount: scenario.hung ? 1 : 0,
    });
    expect(available.length).toBeGreaterThan(1);
    expect(available.every(status => status === 200)).toBe(true);

    if (scenario.hung) {
      expect(Date.now() - started).toBeGreaterThanOrEqual(20000);
    }
    if (scenario.mode === 'Exclusive') {
      expect(addonStatuses).toContain(503);
    }
    if (scenario.repairVersion) {
      expect(await fetch(base + '/api/admin/addon-updates/' + proposal.updateId, { headers })
        .then(response => response.json()))
        .toMatchObject({ phase: 'Failed', paused: true });
      expect(await connection.db!.collection<{ _id: string }>(receipts)
        .find({ _id: { $in: ['0000-runtime', '0001-display-value'] } })
        .sort({ _id: 1 }).toArray()).toEqual(retainedReceipts);
      const duplicate = await fetch(endpoint + '/records/duplicate', { headers });

      expect(duplicate.status).toBe(200);
      expect(await duplicate.json()).toMatchObject({ value: 'preserved' });
      expect((await connection.db!.collection('synthetic_records').indexes())
        .find(index => index.name === 'site_value')?.unique)
        .not.toBe(true);
    }

    const after = await fetch(endpoint + '/records/first', { headers });

    expect(after.status).toBe(200);
    expect(await after.json()).toEqual(original);
    expect(await fetch(endpoint + '/status', { headers }).then(response => response.json()))
      .toMatchObject({ version: scenario.repairVersion ?? scenario.version, schema: scenario.mode });
    const inserted = await fetch(endpoint + '/records/second', {
      method: 'POST',
      headers,
      body: JSON.stringify({ value: 'after', expectedVersion: null }),
    });

    expect(inserted.status).toBe(200);
    await inserted.arrayBuffer();
    const data = await connection.db!.collection('synthetic_records').findOne({ siteId, recordId: 'first' });

    if (scenario.mode === 'Exclusive') {
      expect(data?.displayValue).toBe('preserved');
    }

    expect(await connection.db!.collection(receipts).countDocuments()).toBe(scenario.repairVersion ? 3 : 2);
    const retry = await fetch(base + '/api/admin/addon-updates/' + completedId + '/apply', {
      method: 'POST',
      headers: { Cookie: cookie, Origin: base, 'X-Zarya-Admin': '1' },
    });

    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ phase: 'Completed' });
  } finally {
    await cleanup();
  }
}, 180000);
