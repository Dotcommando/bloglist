import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ADDON_PACKAGE_REGISTRY, ENABLE_SITE_ADDON, GET_SITE_ADDON } from '../dist/infra/addons/addons.tokens.js';
import { createLocalApplication } from '../dist/infra/local-application.js';
import { readLocalSettings } from '../dist/infra/local-application.settings.js';
import { LIST_SITES } from '../dist/infra/sites/sites.tokens.js';

export async function installAddon(application, settings, siteId, artifact, key) {
  const manifestBytes = await readFile(path.join(artifact, 'addon.runtime.json'));
  const manifest = JSON.parse(manifestBytes);

  if (
    manifest.cmsVersion !== '0.16.1'
    || manifest.definition?.addonKey !== key
    || key === 'tasks'
    && !/^1\.0\.\d+$/.test(manifest.definition.implementationVersion)
  ) {
    throw new Error('Unexpected add-on artifact identity');
  }

  const digest = createHash('sha256').update(manifestBytes).digest('hex');
  const registry = application.get(ADDON_PACKAGE_REGISTRY);

  await registry.install(artifact);

  if (registry.runtime(key)?.digest !== digest) {
    throw new Error('Installed runtime digest differs from the supplied artifact');
  }

  const input = { siteId, addonKey: key, actorId: settings.operator.operatorId };
  const { connection } = await application.get(GET_SITE_ADDON).execute(input);
  const defaultValues = key === 'tasks'
    ? { pageSize: 25, leaseSeconds: 900, maxArtifactBytes: 131_072 } : { pageSize: 25 };

  if (connection?.status !== 'Enabled') {
    await application.get(ENABLE_SITE_ADDON).execute({
      ...input,
      expectedVersion: connection?.version ?? null,
      configuration: connection?.configuration ?? { schemaVersion: 1, values: defaultValues },
    });
  }

  const saved = await application.get(GET_SITE_ADDON).execute(input);

  if (saved.connection?.status !== 'Enabled') {
    throw new Error('Add-on connection is unavailable');
  }

  return { addon: key, version: manifest.definition.implementationVersion, digest, status: saved.connection.status };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const settings = readLocalSettings(process.env);

  if (settings.database !== 'bloglist_trial' || process.argv.length !== 3) {
    throw new Error('Usage in bloglist_trial: node --env-file=.env scripts/install-tasks.mjs <runtime-directory>');
  }

  const application = await createLocalApplication(settings);

  try {
    const sites = await application.get(LIST_SITES).execute();
    const matches = sites.filter(site => site.mark === 'BloglistTrial');

    if (matches.length !== 1) {
      throw new Error('Expected exactly one existing BloglistTrial site');
    }

    const result = await installAddon(application, settings, matches[0].siteId, path.resolve(process.argv[2]), 'tasks');

    console.log(JSON.stringify(result));
  } finally {
    await application.close();
  }
}
