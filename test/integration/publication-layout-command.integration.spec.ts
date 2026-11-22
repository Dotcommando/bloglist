import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { publicationModels } from '../../src/adapters/outbound/persistence/mongoose/publication/publication.models.js';
import { siteSchema } from '../../src/adapters/outbound/persistence/mongoose/sites/site.schema.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';
import { dropHookTestDatabase } from '../support/hooks.js';
import { siteFixture } from '../support/sites.js';

it('refuses offline publication conversion while the configured HTTP listener is running', async () => {
  const server = createServer((socket) => socket.end());

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing isolated listener');
    }

    const result = spawnSync(process.execPath, ['scripts/migrate-publication-layout.mjs'], {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        ZARYA_HTTP_HOST: '127.0.0.1',
        ZARYA_HTTP_PORT: String(address.port),
        ZARYA_MONGO_URI: 'mongodb://127.0.0.1:1/',
        ZARYA_MONGO_DATABASE: 'zarya_test_' + randomUUID().replaceAll('-', ''),
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Stop the CMS application in the IDE');
    expect(result.stderr).not.toContain('MongoServerSelectionError');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('migrates legacy release bytes through the actual command without changing database records', async () => {
  const uri = process.env.ZARYA_TEST_MONGO_URI;

  if (!uri) {
    throw new Error('Explicit isolated test MongoDB required');
  }

  const probe = createServer();

  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing isolated port');
  }
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const root = await mkdtemp(path.resolve('.tmp/publication-command-'));
  const connection = await createConnection(uri, {
    dbName: database, autoIndex: false, autoCreate: false,
  }).asPromise();

  try {
    await applyMigrations(connection, 'migrations');
    const { siteId, ...state } = siteFixture().toState();

    await connection.model('Site', siteSchema).insertOne({ _id: siteId, ...state, markKey: 'example' });
    const file = artifact('index.html', 'text/html', 'Retained public output');
    const privateFile = artifact('content/page.json', 'application/json', '{"private":true}', false);
    const manifest = {
      routes: [],
      artifacts: [file, privateFile].map(({ path, mimeType, byteSize, checksum, public: publicFile }) =>
        ({ path, mimeType, byteSize, checksum, public: publicFile })),
    };
    const model = publicationModels(connection).releases;
    const row = {
      _id: 'release',
      siteId,
      siteKey: 'SiteOpaque',
      state: ReleaseState.Ready,
      createdAt: new Date('2026-10-31T12:00:00Z'),
      completedAt: new Date('2026-10-31T12:00:00Z'),
      failure: null,
      manifest,
    };

    await model.insertOne(row);
    const previous = await model.findOne({ _id: 'release' }).lean().exec();
    const artifactsRoot = path.join(root, 'artifacts');
    const legacy = path.join(artifactsRoot, 'sites/SiteOpaque/release');

    await mkdir(path.join(legacy, 'public'), { recursive: true });
    await mkdir(path.join(legacy, 'content'));
    await writeFile(path.join(legacy, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(path.join(legacy, 'public/index.html'), 'Retained public output');
    await writeFile(path.join(legacy, 'content/page.json'), '{"private":true}');
    const run = (): ReturnType<typeof spawnSync> => spawnSync(process.execPath,
      ['scripts/migrate-publication-layout.mjs'], {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          ZARYA_HTTP_HOST: '127.0.0.1',
          ZARYA_HTTP_PORT: String(address.port),
          ZARYA_MONGO_URI: uri,
          ZARYA_MONGO_DATABASE: database,
          ZARYA_ARTIFACTS_ROOT: artifactsRoot,
        },
      });
    const result = run();

    expect(String(result.stderr)).toBe('');
    expect(result.status).toBe(0);
    expect(await readdir(path.join(artifactsRoot, 'sites'))).toEqual(expect.arrayContaining(['example.test']));
    const current = path.join(artifactsRoot, 'sites/example.test/release');

    expect(await readFile(path.join(current, 'public/index.html'), 'utf8')).toBe('Retained public output');
    expect(await readFile(path.join(current, 'content/page.json'), 'utf8')).toBe('{"private":true}');
    await expect(access(path.join(artifactsRoot, 'sites/SiteOpaque'))).rejects.toThrow();
    expect(await model.findOne({ _id: 'release' }).lean().exec()).toEqual(previous);
    expect(run().status).toBe(0);
  } finally {
    await dropHookTestDatabase(connection, database);
    expect(root.startsWith(path.resolve('.tmp') + path.sep)).toBe(true);
    await rm(root, { recursive: true, force: true });
  }
});
