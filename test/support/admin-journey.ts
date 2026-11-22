import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright-core';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import type { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { BrowserInteraction } from '../../src/domain/pages/page-rendering.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { CONFIGURE_PAGE_RENDERING } from '../../src/infra/publication/publication.tokens.js';
import { UPDATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { IUpdateSite } from '../../src/ports/inbound/sites/update-site.port.js';
import { account } from './admin-users.js';

export interface IAdminJourney {
  origin: string;
  page: Page;
  context: BrowserContext;
  errors: string[];
  root: string;
  configureRendering: (siteId: string, pageId: string, templateId: string, delivery: HtmlDelivery) => Promise<void>;
  addLanguage: (siteId: string, language: string) => Promise<void>;
  expireSession: () => Promise<void>;
  close: (failed: boolean) => Promise<void>;
}

/** Site onboarding stays a real UI interaction; each journey owns its storage. */
export async function createJourneySite(f: IAdminJourney): Promise<string> {
  const { page, origin } = f;

  await page.locator('#site-name').fill('Coverage journey');
  await page.locator('#site-domain').fill('coverage.example.test');
  await page.locator('#site-local-address').fill(origin);
  await page.locator('#site-origin-local').check();
  await page.locator('#site-mark').fill('CoverageJourney');
  await page.locator('#site-language').fill('en');
  await page.getByRole('button', { name: 'Create site', exact: true }).click();
  await page.waitForURL(/\/admin\/sites\/[a-f0-9-]{36}$/);

  return new URL(page.url()).pathname;
}

/** Create fixture content in the same controls used by an administrator. */
export async function publishJourneyPage(
  f: IAdminJourney, site: string, title: string, pathname: string,
): Promise<string> {
  const { page, origin } = f;

  await page.goto(origin + site + '/pages/new');
  await page.locator('#page-title').fill(title);
  await page.locator('#page-content').fill('Published ' + title);
  await page.locator('#page-template').selectOption('ZaryaBasic');
  await page.locator('#page-path').fill(pathname);
  await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
  await page.getByText('Page published', { exact: true }).waitFor();
  await page.waitForURL(origin + site);
  await page.getByRole('treeitem')
    .filter({ has: page.locator('._tree-title').and(page.getByText(title, { exact: true })) }).click();

  return page.url();
}

/** Own every resource even if initialization fails halfway through. */
export async function adminJourney(): Promise<IAdminJourney> {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!mongoUri || !executablePath) {
    throw new Error('Set ZARYA_TEST_MONGO_URI and ZARYA_TEST_BROWSER_EXECUTABLE for isolated browser journeys');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const temporaryRoot = path.resolve('.tmp');
  let root = '';
  let connection: Connection | undefined;
  let app: INestApplication<Server> | undefined;
  let local: INestApplicationContext | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  const probe = createServer();
  const close = async (failed: boolean): Promise<void> => {
    const results = await Promise.allSettled([
      (async () => {
        try {
          if (context) {
            if (failed) {
              await mkdir('.tmp/admin-release-results', { recursive: true });
              await context.tracing.stop({ path: path.resolve('.tmp/admin-release-results', database + '.zip') });
            } else {
              await context.tracing.stop();
            }
          }
        } finally {
          await browser?.close();
        }
      })(),
      (async () => {
        app?.getHttpServer().closeAllConnections();
        await app?.close();
        await local?.close();
      })(),
      new Promise<void>((resolve, reject) => {
        if (!probe.listening) {
          resolve();
        } else {
          probe.close((error) => error ? reject(error) : resolve());
        }
      }),
    ]);
    const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);

    try {
      if (connection) {
        if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
          throw new Error('Refusing to delete an unrelated database');
        }
        await connection.dropDatabase();
      }
    } catch (error) {
      failures.push(error);
    }

    try {
      await connection?.close();
    } catch (error) {
      failures.push(error);
    }

    if (root) {
      if (path.dirname(root) !== temporaryRoot || !path.basename(root).startsWith('admin-journey-')) {
        failures.push(new Error('Refusing to delete an unrelated directory'));
      } else {
        try {
          await rm(root, { recursive: true, force: true });
        } catch (error) {
          failures.push(error);
        }
      }
    }
    if (failures.length) {
      throw new AggregateError(failures, 'Browser journey cleanup failed');
    }
  };

  try {
    await mkdir(temporaryRoot, { recursive: true });
    root = await mkdtemp(path.join(temporaryRoot, 'admin-journey-'));
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash('synthetic journey password');

    await new MongooseAdminUserStore(connection).run(async (work) => {
      await work.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
    });
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', resolve);
    });
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test listener address');
    }
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
    const origin = 'http://127.0.0.1:' + address.port;

    app = await createPublicHttpApplication({
      mongoUri,
      database,
      host: '127.0.0.1',
      port: address.port,
      sourcesRoot: path.join(root, 'sites'),
      artifactsRoot: path.join(root, 'artifacts'),
      media: { root: path.join(root, 'media'), publicBaseUrl: '/assets' },
      adminAuth: { origin },
      adminRoot: path.resolve('admin/dist'),
      // Hook delivery is outside these editorial journeys; keep its timer off the fixture write path.
      backgroundWork: false,
    });
    browser = await chromium.launch({ executablePath, headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'en-US' });
    await context.addInitScript((expectedOrigin) => {
      if (location.origin === expectedOrigin && location.pathname.startsWith('/admin')) {
        localStorage.setItem('zarya.admin.language', 'en');
      }
    }, origin);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    const errors: string[] = [];

    context.on('page', (opened) => opened.on('pageerror', (error) => errors.push(error.message)));
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/admin/');
    await page.getByLabel('Email', { exact: true }).fill('user-1@example.test');
    await page.getByLabel('Password', { exact: true }).fill('synthetic journey password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/admin/sites/new');

    const localApplication = async (): Promise<INestApplicationContext> => {
      // Delivery and additional site languages have no control in these workspaces.
      local ??= await createLocalApplication({
        mongoUri,
        database,
        backgroundWork: false,
        operator: { operatorId: 'journey-setup', platformAdministrator: true },
        rendering: { sourcesRoot: path.join(root, 'sites'), artifactsRoot: path.join(root, 'artifacts') },
      });

      return local;
    };
    const configureRendering: IAdminJourney['configureRendering'] = async (siteId, pageId, templateId, delivery) => {
      await (await localApplication()).get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
        siteId,
        pageId,
        actorId: 'journey-setup',
        rendering: { templateId, delivery, interaction: BrowserInteraction.None, parameters: {}, loaders: [] },
      });
    };
    const addLanguage: IAdminJourney['addLanguage'] = async (siteId, language) => {
      await (await localApplication()).get<IUpdateSite>(UPDATE_SITE).execute({ siteId, addLanguages: [language] });
    };
    const expireSession = async (): Promise<void> => {
      if (connection?.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
        throw new Error('Refusing to expire an unrelated session');
      }
      await connection.collection('admin_auth_sessions').updateMany({}, {
        $set: {
          createdAt: new Date(0), lastSeenAt: new Date(1000), expiresAt: new Date(2000),
        },
      });
    };

    return { origin, page, context, errors, root, configureRendering, addLanguage, expireSession, close };
  } catch (error) {
    try {
      await close(true);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Browser journey initialization and cleanup failed');
    }
    throw error;
  }
}
