import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type Connection, createConnection } from 'mongoose';

import { MongooseAddonWriteFence }
  from '../../src/adapters/outbound/persistence/mongoose/addons/addon-write-fence.adapter.js';
import type { IAddonRuntimeHost } from '../../src/adapters/outbound/runtime/addons/addon-package.types.js';
import { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';

function runtimeHost(connection: Connection): IAddonRuntimeHost {
  return {
    cmsVersion: '0.8.0',
    connection,
    origin: null,
    current: null,
    users: null,
    sites: { execute: vi.fn() },
    publications: { stage: vi.fn(), read: vi.fn() },
    activation: { getActive: vi.fn(), activate: vi.fn(), findActivation: vi.fn() },
    fence: new MongooseAddonWriteFence(connection),
    policy: vi.fn(),
    requirePage: vi.fn(),
    secret: vi.fn(),
  };
}

describe('runtime activation for repository packages', () => {
  let root: string;

  beforeEach(async () => {
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/runtime-install-'));
  });
  afterEach(async () => {
    expect(root.startsWith(path.resolve('.tmp') + path.sep)).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  it('rejects concurrent activation through another entry point', async () => {
    const connection = createConnection();
    const registry = new AddonPackageRegistry(root, connection, [], runtimeHost(connection));
    let release!: () => void;
    const waiting = new Promise<never>((_resolve, reject) => {
      release = () => reject(new Error('synthetic failure'));
    });

    vi.spyOn(registry, 'validatePackage').mockReturnValue(waiting);
    const first = registry.install('synthetic').catch((error: unknown) => error);
    const second = registry.install('other').catch((error: unknown) => error);

    try {
      const outcome = await Promise.race([second, new Promise<string>((resolve) => {
        setImmediate(() => resolve('still pending'));
      })]);

      expect(outcome).toMatchObject({ code: 'Conflict' });
    } finally {
      release();
      await Promise.all([first, second]);
      await connection.close();
    }
  });

  it.each([
    {
      name: 'hook extension',
      members: 'canHandle: () => false, handle: async () => {}, hooks: {}',
      cleanupFails: false,
    },
    { name: 'handler', members: 'canHandle: 42, handle: async () => {}', cleanupFails: false },
    {
      name: 'hook extension with failed cleanup',
      members: 'canHandle: () => false, handle: async () => {}, hooks: {}',
      cleanupFails: true,
    },
  ])('disposes a created runtime with an invalid $name before rejecting activation', async scenario => {
    const source = path.join(root, 'invalid-source');
    const connection = createConnection();
    const journal: string[] = [];
    const observe = vi.fn(async (_site: string, event: string) => {
      journal.push(event);

      if (event === 'closed' && scenario.cleanupFails) {
        throw new Error('Synthetic disposer failure');
      }
    });

    vi.spyOn(connection, 'useDb').mockReturnValue(connection);
    const registry = new AddonPackageRegistry(path.join(root, 'installed'), connection, [], {
      ...runtimeHost(connection),
      requirePage: observe,
    });
    const code = `exports.validateConfiguration = () => {};
exports.defaultConfiguration = () => ({schemaVersion: 1, values: {}});
exports.createRuntime = async host => {
  await host.requirePage('synthetic', 'opened');
  return {${scenario.members}, close: async () => { await host.requirePage('synthetic', 'closed'); }};
};`;
    const files = {
      'server.cjs': code,
      'migrations/0000-runtime.json': JSON.stringify({
        id: '0000-runtime', collections: [],
      }),
    };

    await mkdir(path.join(source, 'migrations'), { recursive: true });

    for (const [name, bytes] of Object.entries(files)) {
      await writeFile(path.join(source, name), bytes);
    }
    await writeFile(path.join(source, 'addon.runtime.json'), JSON.stringify({
      cmsVersion: '0.8.0',
      format: 'zarya-addon',
      version: 1,
      collections: [],
      dependencies: {},
      definition: {
        addonKey: 'synthetic',
        implementationVersion: '1.0.0',
        contractVersion: 1,
        configurationSchemaVersion: 1,
        adminComponentId: null,
        snippetIds: [],
        name: { en: 'Synthetic', ru: 'Synthetic' },
        description: { en: 'Test', ru: 'Test' },
      },
      serverEntry: 'server.cjs',
      adminEntry: null,
      styles: [],
      files: Object.fromEntries(Object.entries(files).map(([name, bytes]) =>
        [name, createHash('sha256').update(bytes).digest('hex')])),
    }));

    try {
      if (scenario.cleanupFails) {
        await expect(registry.install(source)).rejects.toMatchObject({
          errors: [
            expect.objectContaining({ message: 'Invalid hook extension' }),
            expect.objectContaining({ message: 'Synthetic disposer failure' }),
          ],
        });
      } else {
        await expect(registry.install(source)).rejects.toThrow('Invalid');
      }
      expect(journal).toEqual(['opened', 'closed']);
      expect(registry.runtime('synthetic')).toBeNull();
      expect(await readdir(path.join(root, 'installed'))).not.toContain('synthetic.json');
    } finally {
      await registry.close();
      await connection.close();
    }
  });

  const readCatalog = { method: 'GET', route: '/api/synthetic/catalog' };

  it.each([
    { name: 'missing module export', routes: undefined },
    { name: 'wrong module method', routes: [{ ...readCatalog, method: 'POST' }] },
    { name: 'extra module route', routes: [readCatalog, { method: 'GET', route: '/api/synthetic/extra' }] },
    { name: 'wrong packaged method', routes: [readCatalog], badInventory: true },
  ])('rejects a runtime whose routes differ from its Actions ($name)', async ({ routes, badInventory }) => {
    const source = path.join(root, 'source');
    const installed = path.join(root, 'installed');
    const connection = createConnection();
    const registry = new AddonPackageRegistry(installed, connection, [], runtimeHost(connection));
    const route = '/api/synthetic/catalog';
    const code = `exports.httpRoutes = ${JSON.stringify(routes)};
exports.validateConfiguration = () => {};
exports.defaultConfiguration = () => ({ schemaVersion: 1, values: {} });
exports.createRuntime = () => ({ canHandle: path => path === '${route}', handle: async () => {} });`;
    const files = {
      'server.cjs': code,
      'server/http-routes.json': JSON.stringify([{ method: badInventory ? 'POST' : 'GET', route }]),
      'migrations/0000-runtime.json': JSON.stringify({ id: '0000-runtime', collections: [] }),
    };

    try {
      await mkdir(path.join(source, 'migrations'), { recursive: true });
      await mkdir(path.join(source, 'server'));

      for (const [name, content] of Object.entries(files)) {
        await writeFile(path.join(source, name), content);
      }
      await writeFile(path.join(source, 'addon.runtime.json'), JSON.stringify({
        cmsVersion: '0.8.0',
        format: 'zarya-addon',
        version: 1,
        collections: [],
        dependencies: {},
        definition: {
          addonKey: 'synthetic',
          implementationVersion: '1.0.0',
          contractVersion: 1,
          configurationSchemaVersion: 1,
          adminComponentId: null,
          snippetIds: [],
          name: { en: 'Synthetic', ru: 'Synthetic' },
          description: { en: 'Test', ru: 'Test' },
        },
        routes: ['/api/synthetic'],
        authorization: {
          version: 1,
          domains: [{ domainId: 'synthetic.catalog', name: 'Catalog', description: 'Catalog' }],
          actions: [{
            actionId: 'synthetic.catalog.read',
            method: 'GET',
            route,
            scope: 'site',
            admission: 'public',
            shortDescription: 'Read catalog',
            description: 'Read catalog',
            domains: ['synthetic.catalog'],
            create: false,
            read: true,
            update: false,
            delete: false,
            execute: false,
            allowedObjectScopes: [],
          }],
        },
        serverEntry: 'server.cjs',
        adminEntry: null,
        styles: [],
        files: Object.fromEntries(Object.entries(files).map(([name, value]) =>
          [name, createHash('sha256').update(value).digest('hex')])),
      }));
      vi.spyOn(connection, 'useDb').mockReturnValue(connection);

      const candidate = badInventory ? registry.validatePackage(source) : registry.install(source);

      await expect(candidate).rejects.toThrow('Runtime HTTP routes do not match declared Actions');
      expect(registry.view('synthetic')).toBeNull();
      await expect(readFile(path.join(installed, 'synthetic.json'))).rejects.toHaveProperty('code', 'ENOENT');
    } finally {
      await registry.close();
      await connection.close();
    }
  });

  it('can retry failed activation using intact immutable files', async () => {
    const source = path.join(root, 'source');
    const installed = path.join(root, 'installed');
    const connection = createConnection();
    const requirePage = vi.fn(async () => {});
    const register = vi.fn();

    register.mockImplementationOnce(() => {
      throw new Error('synthetic registration failure');
    });

    vi.spyOn(connection, 'useDb').mockReturnValue(connection);
    requirePage.mockRejectedValueOnce(new Error('synthetic activation failure'));
    const registry = new AddonPackageRegistry(installed, connection, [], {
      ...runtimeHost(connection),
      requirePage,
      cms: { forAddon: vi.fn(), register, unregister: vi.fn() },
    });
    const code = `exports.validateConfiguration = () => {};
exports.defaultConfiguration = () => ({schemaVersion: 1, values: {}});
exports.createRuntime = async host => {
  await host.requirePage('synthetic', 'page');
  return {canHandle: () => false, handle: async () => {}, cms: {version: 1, objects: {}}};
};`;
    const migration = JSON.stringify({ id: '0000-runtime', collections: [] });
    const files = { 'server.cjs': code, 'migrations/0000-runtime.json': migration };

    await mkdir(path.join(source, 'migrations'), { recursive: true });

    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(source, name), content);
    }
    await writeFile(path.join(source, 'addon.runtime.json'), JSON.stringify({
      cmsVersion: '0.8.0',
      format: 'zarya-addon',
      version: 1,
      collections: [],
      dependencies: {},
      definition: {
        addonKey: 'synthetic',
        implementationVersion: '1.0.0',
        contractVersion: 1,
        configurationSchemaVersion: 1,
        adminComponentId: null,
        snippetIds: [],
        name: { en: 'Synthetic', ru: 'Synthetic' },
        description: { en: 'Test', ru: 'Test' },
      },
      serverEntry: 'server.cjs',
      adminEntry: null,
      styles: [],
      files: Object.fromEntries(Object.entries(files).map(([name, value]) =>
        [name, createHash('sha256').update(value).digest('hex')])),
    }));

    const replicaReads = vi.fn(async () => {});
    const replica = new AddonPackageRegistry(installed, connection, [], {
      ...runtimeHost(connection),
      requirePage: replicaReads,
      cms: { forAddon: vi.fn(), register: vi.fn(), unregister: vi.fn() },
    });

    await replica.initialize();
    const newer = new AddonPackageRegistry(root, connection, [], { ...runtimeHost(connection), cmsVersion: '0.9.0' });
    const older = new AddonPackageRegistry(root, connection, [], { ...runtimeHost(connection), cmsVersion: '0.7.9' });

    await expect(newer.validatePackage(source)).resolves.toMatchObject({ cmsVersion: '0.8.0' });
    await expect(older.validatePackage(source)).rejects.toThrow('Incompatible CMS version');

    try {
      await expect(registry.install(source)).rejects.toThrow('synthetic activation failure');
      expect(registry.runtime('synthetic')).toBeNull();
      await expect(registry.install(source)).rejects.toThrow('synthetic registration failure');
      expect(registry.runtime('synthetic')).toBeNull();
      await expect(readFile(path.join(installed, 'synthetic.json'))).rejects.toHaveProperty('code', 'ENOENT');
      await registry.install(source);
      const digest = registry.runtime('synthetic')!.digest;

      expect(JSON.parse(await readFile(path.join(installed, 'synthetic.json'), 'utf8')))
        .toEqual({ key: 'synthetic', digest });
      await registry.install(source);
      expect(requirePage).toHaveBeenCalledTimes(3);
      expect(replica.runtime('synthetic')).toBeNull();
      await replica.refresh();
      expect(replica.runtime('synthetic')?.digest).toBe(digest);
      await Promise.all([replica.refresh(), replica.refresh()]);
      expect(replicaReads).toHaveBeenCalledTimes(1);
      const coordinatorReads = vi.fn();
      const coordinator = new AddonPackageRegistry(installed, connection, [], {
        ...runtimeHost(connection), coordinatorOnly: true, requirePage: coordinatorReads,
      });

      try {
        await coordinator.initialize();
        await coordinator.refresh();
        expect(coordinatorReads).not.toHaveBeenCalled();
        expect(coordinator.runtime('synthetic')).toMatchObject({ entry: null });
        expect(coordinator.handler('/api/synthetic')).toBeNull();
      } finally {
        await coordinator.close();
      }
      expect((await readdir(installed)).some((name) => name.startsWith('.install-'))).toBe(false);
    } finally {
      await registry.close();
      await replica.close();
      await connection.close();
    }
  });
});
