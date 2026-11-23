import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { checked, fileHash, missing } from '../dist/adapters/outbound/backup/files/dump-files.js';
import { moveAddonDirectory } from '../dist/adapters/outbound/runtime/addons/addon-directory-move.js';
import { ADDON_PACKAGE_REGISTRY } from '../dist/infra/addons/addons.tokens.js';
import { createLocalApplication } from '../dist/infra/local-application.js';
import { readLocalSettings } from '../dist/infra/local-application.settings.js';
import { readPublicHttpSettings } from '../dist/infra/public-http.settings.js';
import { createProcessSupervisor } from '../dist/infra/resources/process-supervisor.js';
import { readProcessSupervisorSettings } from '../dist/infra/resources/process-supervisor.settings.js';
import { LIST_SITES } from '../dist/infra/sites/sites.tokens.js';
import { CmsSession } from './tasks-cms-client.mjs';

const addonKey = 'tasks';

const rcVersion = '1.0.0';

function fixedContract(manifest) {
  const fixed = {
    ...manifest,
    definition: { ...manifest.definition },
    files: Object.fromEntries(Object.entries(manifest.files).filter(([name]) =>
      !name.startsWith('admin/') && name !== manifest.serverEntry)),
  };

  delete fixed.adminEntry;
  delete fixed.styles;
  delete fixed.update;
  delete fixed.definition.implementationVersion;

  return fixed;
}

async function selection(root) {
  const active = JSON.parse(await readFile(await checked(root, 'tasks.json'), 'utf8'));

  if (active.key !== addonKey || !/^[a-f0-9]{64}$/.test(active.digest)) {
    throw new Error('Invalid selected Tasks package');
  }

  return active.digest;
}

async function stageCandidate(root, artifact, destination, digest, registry) {
  const existing = await stat(destination).catch(error => {
    if (!missing(error)) {
      throw error;
    }

    return undefined;
  });

  if (existing) {
    await registry.validatePackage(destination, true);

    if (await fileHash(await checked(destination, 'addon.runtime.json')) !== digest) {
      throw new Error('Tasks package digest differs from its directory');
    }

    return;
  }

  const staging = await mkdtemp(path.join(root, '.tasks-rc-'));
  const directory = path.join(staging, 'package');

  if (path.dirname(staging) !== path.resolve(root)) {
    throw new Error('Tasks staging directory escaped the registry');
  }

  try {
    await cp(artifact, directory, { recursive: true, errorOnExist: true, force: false });
    await registry.validatePackage(directory, true);

    if (await fileHash(await checked(directory, 'addon.runtime.json')) !== digest) {
      throw new Error('Tasks candidate changed during staging');
    }
    await moveAddonDirectory(directory, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function stageReinstall(settings, artifact) {
  if (!/^bloglist_trial(?:_qa_\d+)?$/.test(settings.database) || !settings.operator.platformAdministrator) {
    throw new Error('Tasks candidate reinstall is restricted to the local Bloglist trial');
  }

  const root = path.join(settings.dumpsRoot ?? path.resolve('dumps'), '.installed-addons');
  const application = await createLocalApplication(settings);

  try {
    const registry = application.get(ADDON_PACKAGE_REGISTRY);
    const fromDigest = await selection(root);
    const previousDirectory = await checked(root, 'tasks/' + fromDigest);
    const previous = await registry.validatePackage(previousDirectory, true);
    const candidate = await registry.validatePackage(artifact, true);
    const toDigest = await fileHash(await checked(artifact, 'addon.runtime.json'));

    if (
      candidate.definition.addonKey !== addonKey
      || candidate.definition.implementationVersion !== rcVersion
      || candidate.update !== undefined
      || !/^1\.0\.\d+$/.test(previous.definition.implementationVersion)
      || !isDeepStrictEqual(fixedContract(previous), fixedContract(candidate))
    ) {
      throw new Error('Tasks 1.0.0 reinstall requires identical routes, Actions, collections and migrations');
    }
    if (fromDigest === toDigest) {
      return { digest: toDigest };
    }

    const destination = await checked(root, 'tasks/' + toDigest);

    await stageCandidate(root, artifact, destination, toDigest, registry);

    // An explicit local RC reinstall keeps both immutable builds. CMS owns the
    // apply lifecycle, including worker draining and the authorization generation.
    const updateId = randomUUID();
    const proposal = {
      updateId,
      addonKey,
      fromDigest,
      toDigest,
      fromVersion: previous.definition.implementationVersion,
      toVersion: rcVersion,
      mode: 'Compatible',
    };

    await mkdir(await checked(root, '.updates'), { recursive: true, mode: 0o700 });
    await writeFile(await checked(root, '.updates/' + updateId + '.json'), JSON.stringify(proposal), {
      flag: 'wx', mode: 0o600,
    });

    return { digest: toDigest, updateId };
  } finally {
    await application.close();
  }
}

export async function reinstallTasks(settings, artifact, session) {
  const current = await session.request('/api/admin/auth/me');

  if (current.user?.authorization?.systemAdmin !== true) {
    throw new Error('A CMS installation administrator is required');
  }

  const { digest, updateId } = await stageReinstall(settings, path.resolve(artifact));

  if (updateId) {
    const cookie = session.browserCookies().map(({ name, value }) => name + '=' + value).join('; ');
    const endpoint = '/api/admin/addon-updates/' + updateId;

    try {
      const response = await fetch(session.origin + endpoint + '/apply', {
        method: 'POST',
        headers: { Origin: session.origin, 'X-Zarya-Admin': '1', Cookie: cookie },
        redirect: 'error',
        signal: AbortSignal.timeout(90_000),
      });

      if (!response.ok || (await response.json()).phase !== 'Completed') {
        throw new Error('CMS did not complete the Tasks reinstall');
      }
    } catch (error) {
      const state = await session.request(endpoint).catch(() => undefined);

      if (state?.phase !== 'Completed') {
        throw new Error('Tasks reinstall needs reconciliation in CMS: ' + updateId, { cause: error });
      }
    }
  }

  const root = path.join(settings.dumpsRoot ?? path.resolve('dumps'), '.installed-addons');

  if (await selection(root) !== digest) {
    throw new Error('CMS selected a different Tasks package');
  }

  return { version: rcVersion, digest, reinstalled: updateId !== undefined };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [artifact, credentialsFile, ...extra] = process.argv.slice(2);
  const settings = readLocalSettings(process.env);
  const http = { ...readPublicHttpSettings(process.env), backgroundWork: false };

  if (settings.database !== 'bloglist_trial' || !artifact || !credentialsFile || extra.length || !http.adminAuth) {
    throw new Error('Use the Bloglist trial .env and pass the Tasks runtime and private credential file');
  }

  const credentials = JSON.parse(await readFile(credentialsFile, 'utf8'));
  const session = new CmsSession(http.adminAuth.origin, credentials);
  const probe = await fetch(session.origin + '/api/admin/auth/me', {
    headers: { 'X-Zarya-Admin': '1' },
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
  }).catch(error => {
    if (!(error instanceof TypeError) || error.cause?.code !== 'ECONNREFUSED') {
      throw error;
    }

    return undefined;
  });

  if (probe) {
    await probe.body?.cancel();

    if (probe.status !== 401) {
      throw new Error('The active local listener did not respond as CMS Zarya');
    }
  }

  const host = probe ? undefined
    : await createProcessSupervisor(http, await readProcessSupervisorSettings(process.env));

  try {
    const application = await createLocalApplication(settings);
    let siteId;

    try {
      const sites = await application.get(LIST_SITES).execute();
      const sitesInTrial = sites.filter(site => site.mark === 'BloglistTrial');

      if (sitesInTrial.length !== 1) {
        throw new Error('Expected exactly one existing BloglistTrial site');
      }
      siteId = sitesInTrial[0].siteId;
    } finally {
      await application.close();
    }

    const result = await reinstallTasks(settings, artifact, session);
    const installed = await session.request('/api/admin/sites/' + siteId + '/addons/tasks');

    if (
      installed.definition?.implementationVersion !== result.version
      || installed.connection?.status !== 'Enabled'
    ) {
      throw new Error('Tasks candidate is not enabled on BloglistTrial');
    }
    console.log(JSON.stringify({ ...result, status: installed.connection.status }));
  } finally {
    await host?.close();
  }
}
