import 'reflect-metadata';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

import { NestFactory } from '@nestjs/core';
import { chromium } from 'playwright-core';

import { packAddonArchive } from '../dist/adapters/outbound/runtime/addons/addon-package-archive.js';
import { DatabasePlacement } from '../dist/domain/resources/site-process-allocation.js';
import { CREATE_ADMIN_USER_FROM_CONSOLE } from '../dist/infra/admin-users/admin-users.tokens.js';
import { AppModule } from '../dist/infra/app.module.js';
import { createLocalApplication } from '../dist/infra/local-application.js';
import { readLocalSettings } from '../dist/infra/local-application.settings.js';
import { runMigrations } from '../dist/infra/persistence/run-migrations.js';
import { createPublicHttpApplication } from '../dist/infra/public-http.application.js';
import { readPublicHttpSettings } from '../dist/infra/public-http.settings.js';
import { createProcessSupervisor } from '../dist/infra/resources/process-supervisor.js';
import { CREATE_SITE } from '../dist/infra/sites/sites.tokens.js';
import { installAddon } from './install-tasks.mjs';
import { runTasksClient } from './run-tasks-client.mjs';
import { CmsSession } from './tasks-cms-client.mjs';

const [runtime, mode, updateRuntime] = process.argv.slice(2);

const upgrade = mode === '--upgrade';

if (upgrade && !updateRuntime) {
  throw new Error('Pass an explicit newer runtime for --upgrade');
}

if (!runtime || !process.env.ZARYA_MONGO_URI || process.env.ZARYA_MONGO_DATABASE !== 'bloglist_trial') {
  throw new Error('Use the Bloglist trial .env and pass the built Tasks runtime directory');
}

const initial = JSON.parse(await readFile(path.join(runtime, 'addon.runtime.json'), 'utf8'));

const initialVersion = initial.definition.implementationVersion;

const active = path.resolve(process.env.ZARYA_DUMPS_ROOT ?? 'dumps', '.installed-addons');

const selected = JSON.parse(await readFile(path.join(active, 'bloglist.json'), 'utf8'));

assert.match(selected.digest, /^[a-f0-9]{64}$/);

const bloglist = path.join(active, 'bloglist', selected.digest);

const database = 'bloglist_trial_qa_' + Date.now();

await mkdir('.tmp', { recursive: true });

const root = path.resolve(await mkdtemp(path.join('.tmp', database + '-')));

async function freePort() {
  const probe = net.createServer();

  await new Promise((resolve, reject) => probe.listen({ host: '127.0.0.1', port: 0 }, resolve).once('error', reject));
  const { port } = probe.address();

  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));

  return port;
}

const port = await freePort();

const origin = 'http://127.0.0.1:' + port;

const environment = {
  ZARYA_MONGO_URI: process.env.ZARYA_MONGO_URI,
  ZARYA_MONGO_DATABASE: database,
  ZARYA_ARTIFACTS_ROOT: path.join(root, 'artifacts'),
  ZARYA_SITES_ROOT: path.join(root, 'sites'),
  ZARYA_DUMPS_ROOT: path.join(root, 'dumps'),
  ZARYA_MEDIA_ROOT: path.join(root, 'media'),
  ZARYA_MEDIA_PUBLIC_PATH: '/assets',
  ZARYA_ADMIN_ROOT: path.resolve('admin/dist'),
  ZARYA_ADMIN_AUTH_ORIGIN: origin,
  ZARYA_LOCAL_OPERATOR_ID: 'tasks-qa',
  ZARYA_LOCAL_ADMINISTRATOR: 'true',
  ZARYA_HTTP_PORT: String(port),
  ZARYA_HTTP_HOST: '127.0.0.1',
  ZARYA_PAGE_DIAGNOSTICS: 'false',
};

const settings = readLocalSettings(environment);

await runMigrations(settings, false);

const credentials = name => ({ email: name + '@example.test', password: 'Aa9!' + randomUUID() });

const operator = credentials('admin');

const bootstrap = await NestFactory.createApplicationContext(AppModule.forAdminUserCreation(settings), {
  logger: false, abortOnError: false,
});

try {
  await bootstrap.get(CREATE_ADMIN_USER_FROM_CONSOLE).execute({ actorId: settings.operator.operatorId, ...operator });
} finally {
  await bootstrap.close();
}

const setup = await createLocalApplication(settings);

let siteId;

let secondSite;

try {
  const sites = setup.get(CREATE_SITE);
  const site = await sites.execute({
    mark: 'TasksQa',
    name: 'Tasks QA',
    primaryDomain: 'tasks-qa.example',
    languages: ['en'],
    defaultLanguage: 'en',
    onboarding: { localAddress: origin, originMode: 'Local' },
  });

  siteId = site.siteId;
  secondSite = (await sites.execute({
    mark: 'OtherQa',
    name: 'Other QA',
    primaryDomain: 'other-qa.example',
    languages: ['en'],
    defaultLanguage: 'en',
    onboarding: { localAddress: 'http://127.0.0.1:' + await freePort(), originMode: 'Local' },
  })).siteId;
  assert.equal((await installAddon(setup, settings, siteId, bloglist, 'bloglist')).version, '1.0.0');
  const installed = await installAddon(setup, settings, siteId, path.resolve(runtime), 'tasks');

  assert.deepEqual(await installAddon(setup, settings, siteId, path.resolve(runtime), 'tasks'), installed);
  await installAddon(setup, settings, secondSite, path.resolve(runtime), 'tasks');
  console.log('Installation and repeat registration passed for CMS 0.16.1 and Bloglist 1.0.0');
} finally {
  await setup.close();
}

const publicSettings = { ...readPublicHttpSettings(environment), backgroundWork: false };

const host = upgrade ? await createProcessSupervisor(publicSettings, {
  capacity: 4, infrastructureCpu: 0, cmsCpuBudget: 4, databasePlacement: DatabasePlacement.UnmanagedLocal,
}) : await createPublicHttpApplication(publicSettings);

async function verifyUpgrade(session) {
  const candidate = path.resolve(updateRuntime);
  const manifest = JSON.parse(await readFile(path.join(candidate, 'addon.runtime.json'), 'utf8'));
  const archive = path.join(root, 'upgrade-archive.runtime.gz');

  await packAddonArchive(candidate, archive);
  const cookie = session.browserCookies().map(({ name, value }) => name + '=' + value).join('; ');
  const headers = { Origin: origin, 'X-Zarya-Admin': '1', Cookie: cookie };
  const url = origin + '/api/admin/addon-updates';
  const proposal = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/gzip', 'Content-Length': String((await stat(archive)).size) },
    body: await openAsBlob(archive, { type: 'application/gzip' }),
    signal: AbortSignal.timeout(30_000),
  });

  assert.equal(proposal.status, 200, await proposal.clone().text());
  const { updateId, fromVersion, toVersion } = await proposal.json();

  assert.equal(fromVersion, initialVersion);
  assert.equal(toVersion, manifest.definition.implementationVersion);
  const apply = await fetch(url + '/' + updateId + '/apply', {
    method: 'POST', headers, signal: AbortSignal.timeout(90_000),
  });

  assert.equal(apply.status, 200, await apply.clone().text());
  assert.equal((await apply.json()).phase, 'Completed');
}

try {
  const api = '/api/admin/sites/' + siteId;
  const tasks = api + '/tasks';
  const admin = new CmsSession(origin, operator);
  const accessPath = api + '/access';
  let directory = await admin.request(accessPath);
  const qualified = (area, object) => Object.fromEntries(Object.entries(object).map(([action, scopes]) =>
    [area + '.' + action, scopes]));
  const common = qualified('tasks', {
    'tasks.list': ['groups'], 'tasks.read': ['groups'], 'executions.list': ['groups'],
  });
  const researcherGrants = {
    ...common,
    ...qualified('tasks', {
      'executions.read': ['own'],
      'executions.claim': ['groups'],
      'executions.renew': ['own'],
      'executions.finish': ['own'],
      'executions.cancel': ['own'],
      'artifacts.list': ['own'],
      'artifacts.read': ['own'],
      'artifacts.submit': ['own'],
      'reviews.read': ['own'],
      'known.check': ['groups'],
      'state.read': ['groups'],
      'state.update': ['groups'],
    }),
  };
  const reviewerGrants = {
    ...common,
    ...qualified('tasks', {
      'executions.read': ['groups'],
      'artifacts.list': ['groups'],
      'artifacts.read': ['groups'],
      'reviews.list': ['groups'],
      'reviews.read': ['groups'],
      'reviews.write': ['groups'],
    }),
    ...qualified('bloglist', { 'bloggers.create': ['all'], 'blogs.create': ['all'], 'blogs.check-url': ['all'] }),
  };
  const expectStatus = (promise, ...status) => assert.rejects(promise, error => status.includes(error.status));

  async function role(key, grants, name, roleId = null, actorIds = []) {
    directory = await admin.request(accessPath, {
      revision: directory.revision,
      actionIds: Object.keys(grants),
      objectScopes: grants,
      role: { roleId, key, name, description: 'Test task permission boundaries', actorIds },
    });

    return directory.customRoles.find(item => item.key === key).roleId;
  }
  async function account(name, roleId) {
    const login = credentials(name);
    const result = await admin.request('/api/admin/users', { ...login, roleId, siteId });

    return { id: result.adminUserId, login, client: new CmsSession(origin, login) };
  }
  async function group(key, members) {
    directory = await admin.request(accessPath, {
      revision: directory.revision,
      actionIds: [],
      group: { groupId: null, key, name: key, description: 'Test task group', actorIds: members },
    });

    return directory.groups.find(item => item.key === key).groupId;
  }

  const researcherRole = await role('tasks-researcher', researcherGrants, 'Tasks Researcher');
  const reviewerRole = await role('tasks-reviewer', reviewerGrants, 'Tasks Reviewer');
  const groupReaderRole = await role('tasks-group-reader',
    { ...common, 'tasks.reviews.read': ['groups'] }, 'Tasks Group Reader');
  // Create sequentially against the CMS password-change admission limit.
  const hermes = await account('hermes', researcherRole);
  const competitor = await account('competitor', researcherRole);
  const codex = await account('codex', reviewerRole);
  const groupReader = await account('reader', groupReaderRole);
  const outsider = await account('outsider', reviewerRole);
  const groupId = await group('research', [hermes.id, competitor.id, codex.id, groupReader.id]);
  const anotherGroup = await group('other', [outsider.id]);
  const templateFields = {
    name: 'Fixture template',
    introductionMd: 'Initial **test** instructions',
    completionMd: 'Review is independent.',
    allowedActionIds: ['tasks.known.check'],
    artifactFormat: 'json',
    artifactSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
  };
  const definition = await admin.request(tasks + '/definitions', templateFields);
  const firstTask = await admin.request(tasks + '/tasks', {
    name: 'Fictional discovery',
    contextMd: 'Record only fictional fixture data.',
    definitionId: definition.definitionId,
    definitionVersion: definition.version,
    accessGroupId: groupId,
    repeatMode: 'repeat',
    status: 'active',
  });
  const privateTask = await admin.request(tasks + '/tasks', {
    name: 'Other group',
    definitionId: definition.definitionId,
    definitionVersion: definition.version,
    accessGroupId: anotherGroup,
    repeatMode: 'once',
    status: 'active',
  });
  const taskPath = tasks + '/tasks/' + firstTask.taskId;

  assert.equal((await hermes.client.request(tasks + '/tasks')).total, 1);
  assert.equal((await outsider.client.request(tasks + '/tasks')).total, 1);
  await expectStatus(hermes.client.request(tasks + '/tasks/' + privateTask.taskId), 404);
  await expectStatus(outsider.client.request(taskPath), 404);
  await expectStatus(hermes.client.request(tasks + '/definitions'), 403);
  await expectStatus(hermes.client.request('/api/admin/sites/' + secondSite + '/tasks/tasks'), 403, 404);

  const claimResults = await Promise.allSettled([
    hermes.client.request(taskPath + '/claim', {}, 'claim-hermes'),
    competitor.client.request(taskPath + '/claim', {}, 'claim-rival'),
  ]);

  assert.equal(claimResults.filter(result => result.status === 'fulfilled').length, 1);
  const successful = claimResults.findIndex(result => result.status === 'fulfilled');
  const executor = successful === 0 ? hermes.client : competitor.client;
  const loser = successful === 0 ? competitor.client : hermes.client;
  const claim = claimResults[successful].value;
  const rejected = claimResults.find(result => result.status === 'rejected');

  assert.equal(rejected.reason.status, 409);
  const execution = tasks + '/executions/' + claim.executionId;

  assert.equal((await executor.request(taskPath + '/claim', {}, 'resume')).executionId, claim.executionId);
  await expectStatus(loser.request(execution), 404);
  await expectStatus(loser.request(execution + '/artifacts', { payload: { title: 'forbidden' } }, 'no'), 404);
  await expectStatus(executor.request(execution + '/artifacts', { payload: {} }, 'bad-schema'), 400);
  const identity = { namespace: 'url', value: 'https://example.test/fictional-creator' };
  const approvedInput = { payload: { title: 'Fictional Creator', url: identity.value }, identityKeys: [identity] };
  const submitted = await executor.request(execution + '/artifacts', approvedInput, 'candidate-1');
  const duplicate = await executor.request(execution + '/artifacts', approvedInput, 'candidate-1');

  assert.equal(duplicate.artifactId, submitted.artifactId);
  const ignoredIdentity = { namespace: 'url', value: 'https://example.test/ignored' };
  const ignored = await executor.request(execution + '/artifacts',
    { payload: { title: 'Another fictional record' }, identityKeys: [ignoredIdentity] }, 'candidate-2');

  await executor.request(taskPath + '/state', {
    version: 0, notesMd: 'Try again later', data: { state: 'exhausted_for_now' },
  });
  await executor.request(execution + '/finish', {});
  const nextDefinition = await admin.request(tasks + '/definitions/' + definition.definitionId,
    { ...templateFields, version: 1, introductionMd: 'Second version' });

  await admin.request(taskPath, { ...firstTask, definitionVersion: nextDefinition.version });
  const next = await executor.request(taskPath + '/claim', {}, 'next-execution');

  assert.equal(next.number, 2);
  assert.equal(next.definitionVersionSnapshot.version, 2);
  assert.equal((await executor.request(execution)).definitionVersionSnapshot.version, 1);
  assert.equal((await executor.request(taskPath + '/state')).data.state, 'exhausted_for_now');

  const list = await codex.client.request(tasks + '/reviews');

  assert.equal(list.total, 2);
  assert.equal(list.items.every(item => !Object.hasOwn(item, 'payload')), true);
  assert.equal((await outsider.client.request(tasks + '/reviews')).total, 0);
  const creator = await codex.client.request(api + '/bloglist/bloggers', {
    name: 'Fictional Creator', type: 'PERSON',
  }, 'blogger-fixture');

  assert.ok(creator.bloggerId);
  assert.equal(creator.contactEmail ?? '', '');
  const blog = await codex.client.request(api + '/bloglist/blogs', {
    bloggerId: creator.bloggerId, name: 'Fictional Blog', url: identity.value, platform: 'WEBSITE',
  }, 'blog-fixture');

  assert.ok(blog.blogId);
  assert.equal((await codex.client.request(api + '/bloglist/blogs/check-url', { value: identity.value })).exists, true);
  await expectStatus(hermes.client.request(api + '/bloglist/bloggers'), 403);
  const artifactReview = id => tasks + '/artifacts/' + id + '/review';
  const review = await codex.client.request(artifactReview(submitted.artifactId), {
    decision: 'approved',
    reasonCode: 'verified',
    revision: 0,
    groupSummaryMd: 'Fixture verified',
    externalRefs: ['bloglist:blogger:' + creator.bloggerId, 'bloglist:blog:' + blog.blogId],
  }, 'approve');

  assert.equal(review.externalRefs.length, 2);
  const rejection = {
    decision: 'rejected',
    reasonCode: 'irrelevant',
    revision: 0,
    groupSummaryMd: 'Search elsewhere',
    authorFeedbackMd: 'Private feedback',
  };

  await codex.client.request(artifactReview(ignored.artifactId), rejection, 'reject');
  await codex.client.request(artifactReview(ignored.artifactId), rejection, 'reject');
  assert.equal((await executor.request(artifactReview(ignored.artifactId))).length, 1);
  assert.equal((await executor.request(artifactReview(ignored.artifactId)))[0].authorFeedbackMd, 'Private feedback');
  assert.equal((await groupReader.client.request(artifactReview(ignored.artifactId)))[0].authorFeedbackMd, undefined);
  assert.equal((await executor.request(taskPath + '/known/check', { keys: [ignoredIdentity] }))[0].status, 'rejected');
  assert.equal((await admin.request(tasks + '/tasks/' + privateTask.taskId + '/known/check',
    { keys: [ignoredIdentity] }))[0].status, 'unknown');
  console.log('HTTP, competing claims, scoped permissions, schema and real Bloglist catalog writes passed');

  if (upgrade) {
    await verifyUpgrade(admin);
    assert.equal((await executor.request(execution)).definitionVersionSnapshot.version, 1);
    assert.equal((await codex.client.request(artifactReview(submitted.artifactId)))[0].externalRefs.length, 2);
    console.log('Compatible update preserved the runtime connection, existing Actions and persisted data');
  }

  const browser = await chromium.launch({
    executablePath: process.env.BLOGLIST_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  try {
    const open = async client => {
      await client.login();
      const context = await browser.newContext({ locale: 'en-US' });

      await context.addCookies(client.browserCookies());
      const page = await context.newPage();
      const errors = [];

      page.on('pageerror', error => errors.push(error.message));
      const base = origin + '/admin/sites/' + siteId + '/addons/tasks';

      await page.goto(base, { waitUntil: 'domcontentloaded' });

      return { page, base, errors };
    };
    const adminUi = await open(admin);
    const tabs = page => page.getByRole('navigation', { name: 'Tasks', exact: true });

    await tabs(adminUi.page).getByRole('button', { name: 'Settings', exact: true }).waitFor();
    assert.equal(await tabs(adminUi.page).getByRole('button').count(), 4);

    const available = adminUi.page.getByRole('checkbox', { name: 'Available to claim', exact: true });
    const checkbox = await available.boundingBox();

    assert.equal(checkbox?.width, 20);
    assert.equal(checkbox?.height, 20);
    await available.focus();
    await available.press('Space');
    assert.equal(await available.isChecked(), true);
    await adminUi.page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    await adminUi.page.waitForURL(url => url.searchParams.get('available') === 'true');
    assert.equal(await available.isChecked(), true);

    const add = adminUi.page.getByRole('button', { name: 'Add task', exact: true });
    const refresh = adminUi.page.getByRole('button', { name: 'Refresh', exact: true });

    assert.equal(await add.locator('svg.cms-icon path').getAttribute('d', { timeout: 3000 }), 'M12 5v14M5 12h14');
    const refreshPath = refresh.locator('svg.cms-icon path').nth(1);

    assert.equal(await refreshPath.getAttribute('d', { timeout: 3000 }), 'M21 3v5h-5');
    console.log('CMS checkbox size, keyboard filtering and button SVGs passed');
    await tabs(adminUi.page).getByRole('button', { name: 'Templates' }).click();

    await adminUi.page.getByRole('button', { name: 'Add template', exact: true }).click();
    const breadcrumbs = adminUi.page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
    const parent = breadcrumbs.getByRole('link', { name: 'Templates', exact: true });
    const underline = await parent.evaluate(link => {
      return link.ownerDocument.defaultView.getComputedStyle(link).textUnderlineOffset;
    });

    assert.equal(underline, '3px');
    const actions = adminUi.page.getByRole('group', { name: 'Allowed Actions', exact: true });

    assert.equal(await actions.evaluate(group => group.classList.contains('cms-fieldset')), true);
    const radius = await actions.evaluate(group => {
      return group.ownerDocument.defaultView.getComputedStyle(group).borderRadius;
    });

    assert.equal(radius, '12px');
    const textareas = await adminUi.page.locator('textarea').evaluateAll(fields => fields.map(field => {
      const style = field.ownerDocument.defaultView.getComputedStyle(field);

      return {
        radius: style.borderRadius,
        padding: style.paddingInlineStart,
        resize: style.resize,
      };
    }));

    assert.equal(textareas.length, 4);

    for (const field of textareas) {
      assert.deepEqual(field, { radius: '7px', padding: '14px', resize: 'vertical' });
    }
    await parent.click();
    console.log('CMS breadcrumb navigation and Actions fieldset styles passed');
    await adminUi.page.getByRole('link', { name: 'Fixture template' }).click();
    await adminUi.page.getByRole('textbox', { name: 'Name', exact: true }).fill('Unsaved fixture');
    await tabs(adminUi.page).getByRole('button', { name: 'Tasks', exact: true }).click();
    await adminUi.page.getByText('Save or cancel your changes first.').waitFor();

    const workerUi = await open(executor);

    await workerUi.page.getByRole('link', { name: 'Fictional discovery' }).click();
    await workerUi.page.getByRole('heading', { name: 'Fictional discovery' }).waitFor();
    assert.equal(await tabs(workerUi.page).getByRole('button').count(), 1);
    await workerUi.page.getByRole('button', { name: 'Resume', exact: true }).click();
    await workerUi.page.getByRole('heading', { name: 'Execution №2' }).waitFor();
    const result = workerUi.page.getByRole('textbox', { name: 'Result', exact: true });
    const resultRadius = await result.evaluate(field => {
      return field.ownerDocument.defaultView.getComputedStyle(field).borderRadius;
    });

    assert.equal(resultRadius, '7px');
    await result.fill('{"title":"Browser artifact"}');
    await workerUi.page.getByRole('button', { name: 'Submit artifact', exact: true }).click();
    await workerUi.page.locator('tbody tr').waitFor();
    await workerUi.page.getByRole('button', { name: 'Finish execution', exact: true }).click();
    await workerUi.page.getByRole('heading', { name: 'Completion instructions', exact: true }).waitFor();

    const reviewUi = await open(codex.client);

    await tabs(reviewUi.page).getByRole('button', { name: 'Reviews' }).click();
    await reviewUi.page.locator('tbody tr a').first().click();
    await reviewUi.page.getByText('Browser artifact', { exact: false }).waitFor();
    assert.deepEqual([...adminUi.errors, ...workerUi.errors, ...reviewUi.errors], []);
    console.log('Browser navigation, dirty guard, worker submit/finish and reviewer permissions passed');
  } finally {
    await browser.close();
  }

  const interruptedTask = await admin.request(tasks + '/tasks', {
    ...firstTask,
    name: 'Client recovery',
    repeatMode: 'once',
  });
  const workerConfiguration = {
    origin,
    siteId,
    taskId: interruptedTask.taskId,
    workspace: path.join(root, 'clients'),
    credentials: hermes.login,
  };
  const network = globalThis.fetch;
  let dropped = 0;

  try {
    globalThis.fetch = async (input, init) => {
      const response = await network(input, init);

      if (init?.method === 'POST' && new URL(input).pathname.endsWith('/artifacts') && response.ok && dropped < 2) {
        dropped++;
        await response.body?.cancel();
        throw new TypeError('Simulated lost response after artifact commit');
      }

      return response;
    };
    await assert.rejects(runTasksClient('worker', workerConfiguration, async () => ({
      artifacts: [{ payload: { title: 'Recovered submission' } }],
    })), { name: 'TypeError' });
  } finally {
    globalThis.fetch = network;
  }
  assert.equal(dropped, 2);
  const recovered = await runTasksClient('worker', workerConfiguration, async () => {
    throw new Error('A recovered claim must reuse the saved agent output');
  });

  assert.equal(recovered.status, 'completed');
  assert.equal((await hermes.client.request(tasks + '/executions/' + recovered.executionId + '/artifacts')).total, 1);
  console.log('Worker restart after a lost commit response reused its journal and produced one artifact');

  if (process.env.TASKS_QA_HERMES_EXE || process.env.TASKS_QA_CODEX_ENTRY) {
    const agentTask = await admin.request(tasks + '/tasks', {
      ...firstTask,
      name: 'Isolated model handshake',
      repeatMode: 'once',
      contextMd: 'Use no tools. Produce one fictional QA artifact with payload {"title":"Local agent fixture"}.',
    });
    const configuration = { origin, siteId, taskId: agentTask.taskId, workspace: path.join(root, 'clients') };
    const performed = await runTasksClient('worker', {
      ...configuration,
      credentials: hermes.login,
      knownCheck: true,
      model: { driver: 'hermes', executable: process.env.TASKS_QA_HERMES_EXE, timeoutSeconds: 90 },
    }, process.env.TASKS_QA_HERMES_EXE ? undefined : async () => ({
      artifacts: [{ payload: { title: 'Local agent fixture' } }],
    }));

    assert.equal(performed.status, 'completed');
    assert.equal(performed.submitted, 1);
    const reviewed = await runTasksClient('reviewer', {
      ...configuration,
      credentials: codex.login,
      instructions: 'Use no tools. Approve the isolated QA artifact if title equals Local agent fixture.',
      model: {
        driver: 'codex', executable: process.execPath, entry: process.env.TASKS_QA_CODEX_ENTRY, timeoutSeconds: 120,
      },
    }, process.env.TASKS_QA_CODEX_ENTRY ? undefined : async () => ({
      decision: 'approved', reasonCode: 'fixture-match',
    }));

    assert.equal(reviewed.reviewed, 1);
    const approved = await codex.client.request(tasks + '/reviews?taskId=' + agentTask.taskId + '&status=approved');

    assert.equal(approved.total, 1);
    console.log('Isolated HTTP workflow with worker ' + (process.env.TASKS_QA_HERMES_EXE ? 'Hermes' : 'fixture')
      + ' and reviewer ' + (process.env.TASKS_QA_CODEX_ENTRY ? 'Codex' : 'fixture') + ' passed');
  }

  // Revocation is effective while the old authenticated session is still in use.
  const currentRole = directory.customRoles.find(item => item.roleId === researcherRole);
  const revoked = { ...researcherGrants };

  delete revoked['tasks.executions.claim'];
  await role('tasks-researcher', revoked, currentRole.name, researcherRole, [hermes.id, competitor.id]);
  await expectStatus(executor.request(taskPath + '/claim', {}, 'revoked'), 403);
  console.log('In-session role revocation passed');
} finally {
  await host.close();
}
