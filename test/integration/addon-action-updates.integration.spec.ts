import 'reflect-metadata';

import { createHash, randomUUID } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

import { createConnection } from 'mongoose';
import { expect, it, vi } from 'vitest';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { packAddonArchive } from '../../src/adapters/outbound/runtime/addons/addon-package-archive.js';
import type { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import { LiveAddonUpdates } from '../../src/adapters/outbound/runtime/addons/live-addon-updates.adapter.js';
import { ScryptAdminPasswordAdapter }
  from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { BuiltInRoleId } from '../../src/domain/authorization/built-in-roles.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';
import { ADDON_PACKAGE_REGISTRY, ENABLE_SITE_ADDON } from '../../src/infra/addons/addons.tokens.js';
import { ADMIN_USER_UNIT_OF_WORK } from '../../src/infra/admin-users/admin-users.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { createProcessSupervisor } from '../../src/infra/resources/process-supervisor.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IEnableSiteAddon } from '../../src/ports/inbound/addons/enable-site-addon.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../src/ports/outbound/admin-users/admin-user-store.port.js';
import { account } from '../support/admin-users.js';
import { siteInput } from '../support/sites.js';

const addonKey = 'generation-fixture';

async function writePackage(
  directory: string, version: string, names: string[], mode?: 'Exclusive' | 'Compatible',
): Promise<void> {
  const prefix = '/api/admin/sites/:siteId/' + addonKey;
  const routes = names.map((name) => ({ method: 'GET', route: prefix + '/' + name }));
  const routeSuffixes = names.map((name) => '/' + addonKey + '/' + name);
  const collection = {
    name: 'generation_fixture_records',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'siteId'],
        additionalProperties: false,
        properties: { _id: { bsonType: 'string' }, siteId: { bsonType: 'string' } },
      },
    },
    indexes: [{ name: 'generation_fixture_site', key: { siteId: 1 } }],
  };
  const files = {
    'server/http-routes.json': JSON.stringify(routes),
    'migrations/0000-runtime.json': JSON.stringify({ id: '0000-runtime', collections: [collection] }),
    'server.cjs': `
      exports.defaultConfiguration = () => ({ schemaVersion: 1, values: {} });
      exports.validateConfiguration = () => {};
      exports.httpRoutes = ${JSON.stringify(routes)};
      exports.createRuntime = (host) => ({
        canHandle: (pathname) => pathname.startsWith('/api/admin/sites/')
          && ${JSON.stringify(routeSuffixes)}.some((route) => pathname.endsWith(route)),
        handle: async (request, response) => {
          const { actionId } = host.authorization.read(request);
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ version: '${version}', actionId }));
        },
      });
    `,
  };

  await mkdir(path.join(directory, 'server'), { recursive: true });
  await mkdir(path.join(directory, 'migrations'));

  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(path.join(directory, name), bytes);
  }

  await writeFile(path.join(directory, 'addon.runtime.json'), JSON.stringify({
    format: 'zarya-addon',
    version: 1,
    cmsVersion: '0.16.0',
    definition: {
      addonKey,
      name: { en: 'Generation fixture', ru: 'Generation fixture' },
      description: { en: 'Action updates', ru: 'Action updates' },
      contractVersion: 1,
      implementationVersion: version,
      configurationSchemaVersion: 1,
      adminComponentId: null,
      snippetIds: [],
    },
    routes: [prefix],
    collections: [{ name: collection.name, references: [] }],
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [
      name, createHash('sha256').update(bytes).digest('hex'),
    ])),
    serverEntry: 'server.cjs',
    adminEntry: null,
    styles: [],
    dependencies: {},
    ...(mode ? { update: { fromVersion: '1.0.0', mode } } : {}),
    authorization: {
      version: 1,
      domains: [{ domainId: addonKey + '.views', name: 'Views', description: 'Generation fixture views' }],
      actions: routes.map((route, index) => ({
        ...route,
        actionId: addonKey + '.' + names[index],
        scope: 'site',
        admission: 'admin',
        shortDescription: 'Read ' + names[index],
        description: 'Read the ' + names[index] + ' fixture view.',
        domains: [addonKey + '.views'],
        create: false,
        read: true,
        update: false,
        delete: false,
        execute: false,
        allowedObjectScopes: ['all'],
      })),
    },
  }));
}

it('publishes changed Action generations only when the coordinator selects the installed update', async () => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/addon-generations-'));
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const connection = createConnection(mongoUri, { dbName: database, autoCreate: false, autoIndex: false });
  const probe = createServer();
  let local: Awaited<ReturnType<typeof createLocalApplication>> | undefined;
  let supervisor: Awaited<ReturnType<typeof createProcessSupervisor>> | undefined;

  try {
    await connection.asPromise();
    await applyMigrations(connection, 'migrations');
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', resolve);
    });
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test port');
    }
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));

    const origin = 'http://127.0.0.1:' + address.port;
    const settings = {
      mongoUri,
      database,
      host: '127.0.0.1',
      port: address.port,
      backgroundWork: false,
      adminAuth: { origin },
      sourcesRoot: path.join(root, 'sites'),
      artifactsRoot: path.join(root, 'artifacts'),
      dumpsRoot: path.join(root, 'dumps'),
    };

    local = await createLocalApplication({
      ...settings, rendering: settings, operator: { operatorId: 'test', platformAdministrator: true },
    });
    const { siteId } = await local.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), primaryDomain: '127.0.0.1',
    });
    const password = 'synthetic generation password';
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

    await local.get<IAdminUserUnitOfWorkPort>(ADMIN_USER_UNIT_OF_WORK).run(async (users) => {
      await users.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
      await users.save(new AdminUser({ ...account('action-manager').toState(), passwordDigest }), null, undefined, {
        roleId: BuiltInRoleId.Manager, siteId, grantedBy: 'user-1',
      });
    });
    const baseline = path.join(root, 'baseline');

    await writePackage(baseline, '1.0.0', ['stable', 'obsolete']);
    await local.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).install(baseline);
    await local.get<IEnableSiteAddon>(ENABLE_SITE_ADDON).execute({
      siteId, addonKey, actorId: 'test', expectedVersion: null, configuration: { schemaVersion: 1, values: {} },
    });
    await local.close();
    local = undefined;
    supervisor = await createProcessSupervisor(settings, {
      capacity: 4, infrastructureCpu: 0, cmsCpuBudget: 4, databasePlacement: DatabasePlacement.UnmanagedLocal,
    });

    const base = origin + '/api/admin';
    const common = { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' };

    async function login(email: string): Promise<string> {
      const response = await fetch(base + '/auth/login', {
        method: 'POST', headers: common, body: JSON.stringify({ email, password }),
      });

      expect(response.status, 'Sign in as ' + email + ': ' + await response.text()).toBe(200);

      return response.headers.get('set-cookie')!.split(';')[0]!;
    }

    const owner = { ...common, Cookie: await login('user-1@example.test') };
    const delegate = { ...common, Cookie: await login('action-manager@example.test') };
    const access = base + '/sites/' + siteId + '/access';
    const addon = base + '/sites/' + siteId + '/' + addonKey;
    const selection = path.join(settings.dumpsRoot, '.installed-addons', addonKey + '.json');
    const originalSelection = await readFile(selection, 'utf8');
    const stable = addonKey + '.stable';
    const obsolete = addonKey + '.obsolete';
    const added = addonKey + '.added';

    async function grant(actionIds: string[]): Promise<void> {
      const state = await fetch(access, { headers: owner }).then((response) => response.json());
      const saved = await fetch(access, {
        method: 'POST', headers: owner, body: JSON.stringify({ revision: state.revision, actionIds }),
      });

      expect(saved.status, 'Save grants ' + actionIds.join(', ') + ': ' + await saved.text()).toBe(200);
    }
    async function checkView(view: string, version: string): Promise<void> {
      const response = await fetch(addon + '/' + view, { headers: delegate });

      expect(response.status, 'Read ' + view + ': ' + await response.clone().text()).toBe(200);
      expect(await response.json()).toEqual({ version, actionId: addonKey + '.' + view });
    }
    async function prepare(mode: 'Exclusive' | 'Compatible'): Promise<Response> {
      const directory = path.join(root, mode);
      const archive = directory + '.gz';

      await writePackage(directory, '1.1.0', ['stable', 'added'], mode);
      await packAddonArchive(directory, archive);

      return fetch(base + '/addon-updates', {
        method: 'POST',
        headers: { ...owner, 'Content-Type': 'application/gzip', 'Content-Length': String((await stat(archive)).size) },
        body: await openAsBlob(archive, { type: 'application/gzip' }),
      });
    }

    await grant([stable, obsolete]);
    await checkView('stable', '1.0.0');
    await checkView('obsolete', '1.0.0');
    const rejected = await prepare('Compatible');

    expect(rejected.status, await rejected.text()).toBe(400);
    expect(await readFile(selection, 'utf8')).toBe(originalSelection);
    await checkView('stable', '1.0.0');
    await checkView('obsolete', '1.0.0');

    const prepared = await prepare('Exclusive');

    expect(prepared.status, 'Prepare Exclusive: ' + await prepared.clone().text()).toBe(200);
    const proposal = await prepared.json();

    expect(proposal).toMatchObject({ fromVersion: '1.0.0', toVersion: '1.1.0' });
    await checkView('stable', '1.0.0');
    const update = base + '/addon-updates/' + proposal.updateId;
    const apply = (): Promise<Response> => fetch(update + '/apply', { method: 'POST', headers: owner });
    const migration = vi.spyOn(LiveAddonUpdates.prototype, 'migrate')
      .mockRejectedValueOnce(new Error('Synthetic update failure before activation'));

    try {
      const failed = await apply();

      expect(failed.status, await failed.text()).toBe(500);
      const status = await fetch(update, { headers: owner }).then((response) => response.json());

      expect(status).toMatchObject({ phase: 'Failed', paused: true });
      expect(await readFile(selection, 'utf8')).toBe(originalSelection);
      const previousCatalog = await fetch(access, { headers: owner }).then((response) => response.json());

      expect(previousCatalog.managerActionIds).toEqual(expect.arrayContaining([stable, obsolete]));
      expect(previousCatalog.delegableActionIds).not.toContain(added);
    } finally {
      migration.mockRestore();
    }

    const applied = await apply();
    const updateStatus = await fetch(update, { headers: owner });

    expect(applied.status, 'Apply Exclusive: ' + await applied.clone().text() + ' (' + await updateStatus.text() + ')')
      .toBe(200);
    expect(await applied.json()).toMatchObject({ phase: 'Completed', updateId: proposal.updateId });
    expect(JSON.parse(await readFile(selection, 'utf8'))).toMatchObject({ digest: proposal.toDigest });
    await checkView('stable', '1.1.0');

    for (const view of ['obsolete', 'added']) {
      const denied = await fetch(addon + '/' + view, { headers: delegate });

      expect(denied.status, await denied.text()).toBe(403);
    }
    const catalog = await fetch(access, { headers: owner }).then((response) => response.json());

    expect(catalog.delegableActionIds).toContain(added);
    expect(catalog.delegableActionIds).not.toContain(obsolete);
    await grant([stable, added]);
    await checkView('added', '1.1.0');
  } finally {
    try {
      await supervisor?.close();
      await local?.close();

      if (connection.readyState === 1) {
        expect(connection.name).toBe(database);
        expect(database).toMatch(/^zarya_test_[a-f0-9]{32}$/);
        await connection.dropDatabase();
      }
    } finally {
      await connection.close();

      if (probe.listening) {
        await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
      }
      expect(path.dirname(root)).toBe(path.resolve('.tmp'));
      await rm(root, { recursive: true, force: true });
    }
  }
}, 120000);
