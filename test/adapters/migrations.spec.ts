import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import {
  readMigrations, verifyMigrations, verifyRuntimeMigrationCompatibility,
} from '../../src/adapters/outbound/persistence/mongoose/migrations.js';

describe('explicit persistence migrations', () => {
  it('refuses index retirement from a runtime add-on before accessing existing schemas', async () => {
    await mkdir('.tmp', { recursive: true });
    const root = await mkdtemp(path.resolve('.tmp/index-retirement-'));
    const connection = createConnection();

    try {
      await writeFile(path.join(root, '0000-retirement.json'), JSON.stringify({
        id: '0000-retirement',
        collections: [{ name: 'pages', validator: {}, indexes: [], removedIndexes: ['pages_mark_unique'] }],
      }));
      await expect(verifyRuntimeMigrationCompatibility(connection, root))
        .rejects.toThrow('Runtime migrations cannot transform existing records');
    } finally {
      await connection.close();

      expect(root.startsWith(path.resolve('.tmp') + path.sep)).toBe(true);
      await rm(root, { recursive: true, force: true });
    }
  });
  it('creates the complete pre-release schema from one baseline without legacy data transforms', async () => {
    const migrations = await readMigrations('migrations');
    const expected: unknown = JSON.parse(await readFile('test/fixtures/migration-schema-fingerprints.json', 'utf8'));

    expect(migrations[0]?.id).toBe('0000-schema-migrations');
    const baseline = migrations[0]!;
    const fingerprints = Object.fromEntries(baseline.collections.map((collection) => {
      const schema = {
        validator: collection.validator,
        indexes: [...collection.indexes].sort((a, b) => a.name.localeCompare(b.name))
          .map((index) => ({ ...index, key: Object.entries(index.key) })),
      };
      const canonical = JSON.stringify(schema, (_key, value: unknown) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);

      return [collection.name, createHash('sha256').update(canonical).digest('hex')];
    }));

    expect(fingerprints).toEqual(expected);
    expect(baseline.transform).toBeUndefined();
    expect(baseline.collections.every((collection) => collection.fieldDefaults === undefined
      && collection.removedIndexes === undefined)).toBe(true);
  });
  it('retains the site/kind/path suggestion index alongside URL uniqueness', async () => {
    const migrations = await readMigrations('migrations');
    const urls = migrations[0]?.collections.find((item) => item.name === 'urls');

    expect(urls?.indexes).toContainEqual({
      key: { siteId: 1, kind: 1, path: 1 }, name: 'urls_site_kind_path', unique: false,
    });
  });
  it('allows nullable social fields in drafts and retained versions without rewriting legacy snapshots', async () => {
    const migrations = await readMigrations('migrations');
    const collections = migrations[0]?.collections.filter((item) => ['pages', 'page_publications'].includes(item.name));

    expect(collections?.map((item) => item.name)).toEqual(['pages', 'page_publications']);
    expect(JSON.stringify(collections)).toContain('ogTitle');
    expect(JSON.stringify(collections)).toContain('ogType');
    expect(JSON.stringify(collections)).not.toContain('fieldDefaults');
  });
  it('preserves the partial current-PAGE unique index instead of applying it to redirects', async () => {
    const migrations = await readMigrations('migrations');
    const urls = migrations[0]?.collections
      .find((collection) => collection.name === 'urls');

    expect(urls?.indexes.find((index) => index.name === 'urls_current_page_unique'))
      .toHaveProperty('partialFilterExpression', { kind: 'PAGE' });
  });
  it('loads versioned manifests with reproducible checksums and no duplicate IDs', async () => {
    const first = await readMigrations('migrations');
    const second = await readMigrations('migrations');

    expect(first.map((migration) => migration.id)).toEqual([
      '0000-schema-migrations',
      '0001-deployment-targets',
      '0002-deployment-diagnostics',
      '0003-markdown-representations',
      '0004-json-ld-catalogs',
      '0005-installation-settings',
      '0006-json-ld-node-settings',
      '0007-page-resolutions',
      '0008-snippet-pool-observations',
      '0009-parallel-snippet-execution',
      '0010-request-document-cache',
      '0011-page-editorial-tv-choices',
      '0012-resource-calibration',
      '0013-addon-runtime-controls',
      '0014-addon-calibration-scenarios',
      '0015-rbac-and-transliteration',
      '0016-dump-access-and-installation-restore',
      '0017-addon-action-generations',
      '0018-addon-repository-update-action',
      '0019-normalize-file-libraries',
      '0020-stage-media-mutations',
      '0021-guard-media-edits',
    ]);
    expect(first.map((migration) => migration.id)).toEqual([...new Set(first.map((migration) => migration.id))]);
    expect(first.map((migration) => migration.checksum)).toEqual(second.map((migration) => migration.checksum));
    expect(first[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects startup on a missing database or missing schema rather than mutating it', async () => {
    const connection = createConnection();
    const create = vi.spyOn(connection, 'createCollection');

    await expect(verifyMigrations(connection, 'migrations')).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
