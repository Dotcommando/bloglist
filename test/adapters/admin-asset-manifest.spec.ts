import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readAdminPublicAssets } from '../../src/adapters/inbound/documents/http/admin/admin-asset-manifest.js';

describe('administration public asset graph', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'zarya-admin-manifest-'));
    await mkdir(path.join(root, '.vite'));
  });
  afterEach(async () => rm(root, { recursive: true, force: true }));

  async function manifest(value: unknown): Promise<void> {
    await writeFile(path.join(root, '.vite/manifest.json'), JSON.stringify(value));
  }

  it('exposes only static entry dependencies, excluding dynamic code and its transitive styles', async () => {
    await manifest({
      'index.html': {
        file: 'assets/login.js',
        isEntry: true,
        imports: ['shared'],
        dynamicImports: ['workspace'],
        css: ['assets/login.css'],
      },
      shared: { file: 'assets/shared.js', imports: ['base'], css: ['assets/shared.css'] },
      base: { file: 'assets/base.js', imports: ['shared'] },
      workspace: { file: 'assets/workspace.js', imports: ['private'], css: ['assets/workspace.css'] },
      private: { file: 'assets/private.js', css: ['assets/private.css'] },
    });

    expect([...(await readAdminPublicAssets(root))].sort()).toEqual([
      'assets/base.js', 'assets/login.css', 'assets/login.js', 'assets/shared.css', 'assets/shared.js',
    ]);
  });

  it.each([
    {},
    { entry: { file: '../private.js', isEntry: true } },
    { entry: { file: 'assets/login.js', isEntry: true, imports: ['missing'] } },
    { entry: { file: 'assets/login.js', isEntry: true, dynamicImports: ['missing'] } },
    { entry: { file: 'assets/login.js', isEntry: true, css: ['../private.css'] } },
    {
      entry: { file: 'assets/login.js', isEntry: true },
      other: { file: 'assets/private.js', isEntry: true },
    },
  ])('rejects invalid build metadata instead of allowing public fallback: %j', async (value) => {
    await manifest(value);

    await expect(readAdminPublicAssets(root)).rejects.toThrow();
  });

  it('refuses missing build metadata', async () => {
    await expect(readAdminPublicAssets(root)).rejects.toThrow();
  });
});
