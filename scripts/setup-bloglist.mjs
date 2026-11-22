import 'reflect-metadata';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NestFactory } from '@nestjs/core';

import { ADDON_PACKAGE_REGISTRY, ENABLE_SITE_ADDON, GET_SITE_ADDON } from '../dist/infra/addons/addons.tokens.js';
import { CREATE_ADMIN_USER_FROM_CONSOLE } from '../dist/infra/admin-users/admin-users.tokens.js';
import { AppModule } from '../dist/infra/app.module.js';
import { createLocalApplication } from '../dist/infra/local-application.js';
import { readLocalSettings } from '../dist/infra/local-application.settings.js';
import { CREATE_SITE, LIST_SITES } from '../dist/infra/sites/sites.tokens.js';

const settings = readLocalSettings(process.env);

if (!/^bloglist_trial(?:_qa_[0-9]+)?$/.test(settings.database)) {
  throw new Error('This tool is restricted to the isolated Bloglist trial database');
}

if (!process.argv[2]) {
  throw new Error('Pass a prebuilt Bloglist runtime directory');
}

const runtime = path.resolve(process.argv[2]);

const manifestBytes = await readFile(path.join(runtime, 'addon.runtime.json'));

const manifest = JSON.parse(manifestBytes);

if (manifest.cmsVersion !== '0.14.0' || manifest.definition.addonKey !== 'bloglist') {
  throw new Error('Expected the Bloglist runtime for CMS 0.14.0');
}

const stateRoot = path.resolve('.tmp', settings.database);

await mkdir(stateRoot, { recursive: true });

const application = await createLocalApplication(settings);

let site;

try {
  await application.get(ADDON_PACKAGE_REGISTRY).install(runtime);
  const sites = await application.get(LIST_SITES).execute();

  site = sites.find((item) => item.mark === 'BloglistTrial');

  if (!site) {
    site = await application.get(CREATE_SITE).execute({
      mark: 'BloglistTrial',
      name: 'Bloglist — тестовый каталог',
      primaryDomain: 'bloglist.example',
      languages: ['ru'],
      defaultLanguage: 'ru',
      onboarding: { localAddress: 'http://localhost:3003', originMode: 'Local' },
    });
  }

  const input = { siteId: site.siteId, addonKey: 'bloglist', actorId: settings.operator.operatorId };
  const view = await application.get(GET_SITE_ADDON).execute(input);

  if (view.connection?.status !== 'Enabled') {
    await application.get(ENABLE_SITE_ADDON).execute({
      ...input,
      expectedVersion: view.connection?.version ?? null,
      configuration: view.connection?.configuration ?? { schemaVersion: 1, values: { pageSize: 25 } },
    });
  }

  const state = JSON.parse(await readFile(path.join(settings.dumpsRoot, '.installed-addons/bloglist.json'), 'utf8'));
  const digest = createHash('sha256').update(manifestBytes).digest('hex');

  if (state.digest !== digest) {
    throw new Error('Selected runtime digest mismatch');
  }
  await writeFile(path.join(stateRoot, 'site.json'), JSON.stringify({
    siteId: site.siteId,
    runtimeDigest: digest,
    cmsVersion: '0.14.0',
    addonVersion: manifest.definition.implementationVersion,
  }, null, 2) + '\n');
} finally {
  await application.close();
}

const credentialsPath = path.join(stateRoot, 'credentials.json');

let credentialsExist = true;

try {
  await readFile(credentialsPath);
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
  credentialsExist = false;
}

if (!credentialsExist) {
  const credentials = { email: 'admin@bloglist.local', password: randomUUID() + '!Aa9' };
  const admin = await NestFactory.createApplicationContext(AppModule.forAdminUserCreation(settings), {
    logger: false, abortOnError: false,
  });

  try {
    await admin.get(CREATE_ADMIN_USER_FROM_CONSOLE).execute({
      actorId: settings.operator.operatorId, ...credentials,
    });
    await writeFile(credentialsPath, JSON.stringify(credentials) + '\n', { flag: 'wx', mode: 0o600 });
  } finally {
    await admin.close();
  }
}

process.stdout.write(JSON.stringify({
  siteId: site.siteId,
  cmsVersion: '0.14.0',
  addonVersion: manifest.definition.implementationVersion,
  privateCredentials: path.relative(process.cwd(), credentialsPath),
}) + '\n');
