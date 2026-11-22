import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IRuntimeAddonRegistration } from '../../src/adapters/outbound/runtime/addons/addon-package.types.js';
import { buildAddonPackage } from '../../src/adapters/outbound/runtime/addons/addon-package-builder.js';

describe('runtime package CMS compatibility', () => {
  let root = '';

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves the declared minimum CMS version when the builder host is newer', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'addon-build-'));
    const server = path.join(root, 'server.js');
    const schemas = path.join(root, 'schemas');

    await mkdir(schemas);
    await writeFile(server, 'module.exports = {};');
    await writeFile(path.join(schemas, 'empty.json'), JSON.stringify({ collections: [] }));
    const registration: IRuntimeAddonRegistration = {
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
      migrationsDirectory: schemas,
      transfer: { collections: [], serverSource: server, schemaDirectories: [schemas], minimumCmsVersion: '0.7.0' },
      validate: () => {},
    };
    const destination = path.join(root, 'package');

    await buildAddonPackage(registration, destination);
    const manifest = JSON.parse(await readFile(path.join(destination, 'addon.runtime.json'), 'utf8'));

    expect(manifest.cmsVersion).toBe('0.7.0');
  });
});
