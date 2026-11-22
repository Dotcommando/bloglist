import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';

interface ICliResult { readonly code: number | null; readonly output: string; }

function assertTestDatabase(actual: string, expected: string): void {
  if (actual !== expected || !/^zarya_test_[a-f0-9]{32}$/.test(expected)) {
    throw new Error('Unsafe test database');
  }
}

function create(email: string, password: string, database: string, mongoUri: string,
  arguments_: readonly string[] = []): Promise<ICliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'dist/create-admin.js', ...arguments_], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        ZARYA_MONGO_URI: mongoUri,
        ZARYA_MONGO_DATABASE: database,
        ZARYA_LOCAL_OPERATOR_ID: 'console-test-operator',
        ZARYA_LOCAL_ADMINISTRATOR: 'true',
        ZARYA_MEDIA_ROOT: './.tmp/admin-console-media',
        ZARYA_MEDIA_PUBLIC_PATH: '/media',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({ code, output });
    });
    child.stdin.end(email + '\n' + password + '\n');
  });
}

describe('private console entry point with isolated persistence', () => {
  it('creates through the application, reports duplicates safely and rejects credential arguments', async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated database endpoint required');
    }

    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    const password = 'synthetic console secret phrase';

    try {
      await applyMigrations(connection, 'migrations');
      const result = await create('Console@EXAMPLE.TEST', password, database, mongoUri);

      expect(result.code).toBe(0);
      expect(result.output).toMatch(/Created administrator: /);
      expect(result.output).not.toContain(password);
      expect(result.output).not.toContain('scrypt$');
      const row = await connection.collection('admin_users').findOne({ email: 'console@example.test' });

      expect(row).toMatchObject({ allowedSiteIds: [], blocked: false, deletedAt: null });
      expect(row?.passwordDigest).toMatch(/^scrypt\$v1\$/);
      expect(await connection.collection('role_assignments').findOne({ actorId: row?._id }))
        .toMatchObject({ roleId: 'cms.system.admin', scope: 'installation', siteId: null });
      const duplicate = await create('CONSOLE@example.test', password, database, mongoUri);

      expect(duplicate.code).toBe(1);
      expect(duplicate.output).toContain('email is already used');
      expect(duplicate.output).not.toContain(password);
      expect(await connection.collection('admin_users').countDocuments()).toBe(1);
      const invalidArguments = await create('other@example.test', password, database, mongoUri, ['--unexpected']);

      expect(invalidArguments.code).toBe(1);
      expect(invalidArguments.output).not.toContain(password);
      expect(await connection.collection('admin_users').countDocuments()).toBe(1);
      const script = await readFile('scripts/create-admin.sh', 'utf8');

      expect(await connection.collection('hook_events').countDocuments({
        hookKey: 'cms.installation.setup.completed',
      })).toBe(1);
      expect(await connection.collection('cms_installations').findOne({ singletonKey: 'Local' }))
        .toMatchObject({ setupState: 'Completed', setupCompletedAt: expect.any(Date) });

      expect(script).toContain('read -r -s');
      expect(script).toContain('set +x');
    } finally {
      try {
        assertTestDatabase(connection.name, database);
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  });

  it('creates SiteAdmin for an existing site and rolls back a missing-site assignment', async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated database endpoint required');
    }

    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    const password = 'synthetic scoped console secret';
    const siteId = 'console-site';
    const timestamp = new Date('2026-11-19T00:00:00Z');

    try {
      await applyMigrations(connection, 'migrations');
      const site = {
        _id: siteId,
        mark: 'ConsoleSite',
        markKey: 'consolesite',
        name: 'Console site',
        primaryDomain: 'console.example.test',
        languages: ['en'],
        defaultLanguage: 'en',
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await connection.collection<{ _id: string }>('sites').insertOne(site);
      const invalid = await create('missing@example.test', password, database, mongoUri,
        ['--site-id', 'unknown-site']);

      expect(invalid.code).toBe(1);
      expect(invalid.output).toContain('Site not found');
      expect(invalid.output).not.toContain(password);
      expect(await connection.collection('admin_users').countDocuments()).toBe(0);
      expect(await connection.collection('role_assignments').countDocuments()).toBe(0);

      const result = await create('site-admin@example.test', password, database, mongoUri,
        ['--site-id', siteId]);

      expect(result.code).toBe(0);
      expect(result.output).not.toContain(password);
      const row = await connection.collection('admin_users').findOne({ email: 'site-admin@example.test' });
      const assignments = await connection.collection('role_assignments').find({ actorId: row?._id }).toArray();

      expect(assignments).toMatchObject([{ roleId: 'cms.system.site-admin', scope: 'site', siteId }]);
      expect(await connection.collection('hook_events').countDocuments({
        hookKey: 'cms.installation.setup.completed',
      })).toBe(0);

      const global = await create('global@example.test', password, database, mongoUri);

      expect(global.code).toBe(0);
      expect(await connection.collection('hook_events').countDocuments({
        hookKey: 'cms.installation.setup.completed',
      })).toBe(1);
    } finally {
      try {
        assertTestDatabase(connection.name, database);
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  });
});
