import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';

describe('authorization MongoDB migration', () => {
  it('adds built-in roles and backfills the existing directory once', async () => {
    const uri = process.env.ZARYA_TEST_MONGO_URI;

    if (!uri) {
      throw new Error('Explicit test MongoDB required');
    }

    const database = 'zarya_rbac_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(uri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();
    const previous = await mkdtemp(path.join(tmpdir(), 'zarya-rbac-migrations-'));

    try {
      for (const name of (await readdir('migrations')).filter((file) => /^00(?:0\d|1[0-4])-.*\.json$/.test(file))) {
        await copyFile(path.join('migrations', name), path.join(previous, name));
      }
      await applyMigrations(connection, previous);
      const db = connection.db!;
      const timestamp = new Date('2026-01-01T00:00:00Z');
      const identities = ['existing-active', 'existing-blocked', 'existing-deleted'];

      await db.collection<{ _id: string }>('admin_users').insertMany(identities.map((id, index) => ({
        _id: id,
        email: `${id}@example.invalid`,
        allowedSiteIds: [],
        blocked: index === 1,
        passwordDigest: 'existing-digest',
        deletedAt: index === 2 ? timestamp : null,
        version: 'existing-version',
        createdAt: timestamp,
        updatedAt: timestamp,
      })));

      const cachedSnippet = {
        _id: 'existing-cached-snippet',
        siteId: 'site',
        kind: 'Snippet',
        key: 'CachedSnippet',
        name: 'Cached snippet',
        version: 'existing-version',
        html: '',
        css: '',
        browserTypeScript: null,
        parameters: [],
        snippet: {
          code: 'return "cached";',
          output: { name: 'result', kind: 'String', required: true },
          phases: ['Request'],
          cache: { scope: 'SharedPublic', maxAgeMs: 1000 },
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        backupState: 'Ready',
      };
      const elements = db.collection<typeof cachedSnippet>('rendering_elements');

      await elements.insertOne(cachedSnippet);

      await applyMigrations(connection, 'migrations');
      expect(await elements.findOne({ _id: cachedSnippet._id })).toEqual(cachedSnippet);
      const roles = await db.collection('roles').find().project({ _id: 0, name: 1, scope: 1, siteId: 1 })
        .sort({ name: 1 }).toArray();

      expect(roles).toEqual([
        { name: 'Manager', scope: 'site', siteId: null },
        { name: 'SiteAdmin', scope: 'site', siteId: null },
        { name: 'SystemAdmin', scope: 'installation', siteId: null },
      ]);
      const assignments = await db.collection('role_assignments').find().sort({ actorId: 1 }).toArray();

      expect(assignments).toMatchObject(identities.slice(0, 2).map((actorId) => ({
        actorId, roleId: 'cms.system.admin', scope: 'installation', siteId: null,
      })));
      const groups = await db.collection('access_groups').find({ siteId: null })
        .project({ _id: 0, name: 1, roleId: 1, status: 1 }).sort({ name: 1 }).toArray();

      expect(groups).toEqual([
        { name: 'Global', roleId: 'cms.system.admin', status: 'active' },
        { name: 'Site', roleId: 'cms.system.site-admin', status: 'active' },
      ]);
      const permissions = db.collection('role_permissions');

      expect(await permissions.findOne({
        siteId: null,
        roleId: 'cms.system.admin',
        actionId: 'cms.installation-settings.read',
      })).toMatchObject({ objectScopes: ['all'] });
      expect(await permissions.findOne({
        siteId: null,
        roleId: 'cms.system.site-admin',
        actionId: 'cms.site-settings.read',
      })).toMatchObject({ objectScopes: ['all'] });
      expect(await permissions.findOne({
        siteId: null,
        roleId: 'cms.system.site-admin',
        actionId: 'cms.installation-settings.read',
      })).toBeNull();
      expect(await db.collection('actions').countDocuments()).toBeGreaterThanOrEqual(201);
      expect(await db.collection('actions').findOne({ actionId: 'cms.site-settings.read' }))
        .toMatchObject({ scope: 'site', status: 'active', allowedObjectScopes: ['all'] });
      expect(await db.collection<{ _id: string }>('admin_users').findOne({ _id: 'existing-blocked' }))
        .toMatchObject({ blocked: true, version: 'existing-version' });
      await expect(db.collection('role_assignments').insertOne({
        scope: 'site',
        siteId: null,
        actorId: 'existing-active',
        roleId: 'cms.system.site-admin',
        createdAt: timestamp,
        createdBy: null,
      })).rejects.toMatchObject({ code: 121 });
      const receipt = await db.collection<{ _id: string }>('schema_migrations')
        .findOne({ _id: '0015-rbac-and-transliteration' });

      expect(receipt).toMatchObject({ checksum: expect.stringMatching(/^[a-f0-9]{64}$/), appliedAt: expect.any(Date) });
      await applyMigrations(connection, 'migrations');
      expect(await db.collection('role_assignments').find().sort({ actorId: 1 }).toArray()).toEqual(assignments);
      expect(await db.collection<{ _id: string }>('schema_migrations')
        .findOne({ _id: '0015-rbac-and-transliteration' }))
        .toEqual(receipt);
    } finally {
      try {
        expect(connection.name).toBe(database);
        await connection.dropDatabase();
      } finally {
        await connection.close();
        await Promise.all((await readdir(previous)).map((file) => unlink(path.join(previous, file))));
        await rmdir(previous);
      }
    }
  });
});
