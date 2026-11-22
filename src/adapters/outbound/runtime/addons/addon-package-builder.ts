import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build } from 'vite';

import { checked, fileHash, treeRecords } from '../../backup/files/dump-files.js';
import { addonRouteInventoryFile, readAddonAuthorization } from './addon-authorization-manifest.js';
import type { IAddonPackageManifest, IRuntimeAddonRegistration } from './addon-package.types.js';
import { packageObject } from './addon-package-manifest.js';
import { supportsCmsVersion } from './cms-version.js';

/** Build-time only: production imports install the prebuilt package without compilers or npm. */
export async function buildAddonPackage(registration: IRuntimeAddonRegistration, destination: string): Promise<void> {
  const transfer = registration.transfer;

  if (!transfer?.serverSource || !transfer.schemaDirectories?.length) {
    throw new Error('Registered add-on requires explicit runtime sources and owned schema sources');
  }
  await mkdir(destination, { recursive: true });
  const server = path.join(destination, 'server');

  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      outDir: server,
      emptyOutDir: true,
      target: 'node26',
      sourcemap: false,
      minify: false,
      lib: { entry: transfer.serverSource, formats: ['cjs'], fileName: () => 'runtime.cjs' },
      rollupOptions: {
        external: (id) => id.startsWith('node:') || builtinModules.includes(id)
      || id === 'mongoose' || id.startsWith('@zarya/addon-contracts/'),
      },
    },
  });
  let adminEntry: string | null = null;
  const styles: string[] = [];

  if (transfer.adminSource) {
    await build({
      configFile: false,
      logLevel: 'error',
      plugins: [svelte()],
      build: {
        outDir: path.join(destination, 'admin'),
        emptyOutDir: true,
        target: 'es2023',
        sourcemap: false,
        lib: { entry: transfer.adminSource, formats: ['es'], fileName: () => 'runtime.js', cssFileName: 'runtime' },
      },
    });
    adminEntry = 'admin/runtime.js';
  }

  const schemas = new Map<string, Record<string, unknown>>();
  const owned = new Set(transfer.collections.map((item) => item.name));

  for (const directory of transfer.schemaDirectories) {
    for (const name of (await readdir(directory)).filter((name) => name.endsWith('.json')).sort()) {
      const migration = packageObject(JSON.parse(await readFile(path.join(directory, name), 'utf8')));

      if (!Array.isArray(migration.collections)) {
        throw new Error('Invalid add-on schema source');
      }

      for (const value of migration.collections) {
        const collection = packageObject(value);

        if (typeof collection.name === 'string' && owned.has(collection.name)) {
          const schema = { ...collection };

          delete schema.fieldDefaults;
          schemas.set(collection.name, schema);
        }
      }
    }
  }

  if (schemas.size !== owned.size) {
    throw new Error('An owned add-on schema source is missing');
  }
  await mkdir(path.join(destination, 'migrations'));
  await writeFile(path.join(destination, 'migrations', '0000-runtime.json'), JSON.stringify({
    id: '0000-runtime', collections: [...schemas.values()],
  }, null, 2) + '\n');
  const authorization = transfer.authorization === undefined ? undefined : readAddonAuthorization(
    transfer.authorization, registration.definition.addonKey, transfer.routes ?? [],
  );

  if (authorization) {
    const pairs = authorization.actions.map(({ method, route }) => ({ method, route }));

    await writeFile(path.join(destination, addonRouteInventoryFile), JSON.stringify(pairs) + '\n');
  }

  const files: Record<string, string> = {};

  for await (const record of treeRecords(destination, 'package')) {
    if (record.kind === 'file' && typeof record.path === 'string' && record.path !== 'addon.runtime.json') {
      files[record.path] = await fileHash(await checked(destination, record.path));

      if (record.path.endsWith('.css')) {
        styles.push(record.path);
      }
    }
  }
  const host = packageObject(JSON.parse(await readFile('package.json', 'utf8')));
  const dependencies = packageObject(host.dependencies);
  const manifest: IAddonPackageManifest = {
    format: 'zarya-addon',
    ...(transfer.routes ? { routes: transfer.routes } : {}),
    ...(authorization ? { authorization } : {}),
    ...(transfer.update ? { update: transfer.update } : {}),
    version: 1,
    cmsVersion: transfer.minimumCmsVersion ?? String(host.version),
    definition: registration.definition,
    ...(transfer.calibrationQueries ? { calibrationQueries: transfer.calibrationQueries } : {}),
    collections: transfer.collections,
    files,
    serverEntry: 'server/runtime.cjs',
    adminEntry,
    styles,
    dependencies: {
      mongoose: String(dependencies.mongoose),
      '@zarya/addon-contracts': String(dependencies['@zarya/addon-contracts']),
    },
  };

  if (!supportsCmsVersion(manifest.cmsVersion, host.version)) {
    throw new Error('Invalid or unsupported minimum CMS version');
  }

  await writeFile(path.join(destination, 'addon.runtime.json'), JSON.stringify(manifest, null, 2) + '\n');
}
