import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { installedAddons } from '../src/infra/addons/installed-addons.js';

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(root, entry.name);

    return entry.isDirectory() ? files(filename) : [filename];
  });
}

describe('clean CMS distribution', () => {
  it('ships an empty add-on registration without installed business packages', () => {
    const manifest: { dependencies: Record<string, string> } = JSON.parse(readFileSync('package.json', 'utf8'));

    expect(installedAddons).toEqual([]);
    expect(Object.keys(manifest.dependencies)).not.toContain('@zarya/participation');
  });

  it('keeps optional business integration out of backend and admin source', () => {
    for (const filename of [...files('src'), ...files('admin/src')]) {
      const source = readFileSync(filename, 'utf8');

      expect(source, filename).not.toMatch(/@zarya\/participation|ZARYA_PARTICIPATION_|ZARYA_SESSION_API_ENABLED/);
      expect(filename).not.toMatch(/[/\\]participation[/\\]/);
    }
  });

  it('does not create event or booking collections in the core migration baseline', () => {
    for (const filename of files('migrations').filter(filename => filename.endsWith('.json'))) {
      const migration: { collections: { name: string }[] } = JSON.parse(readFileSync(filename, 'utf8'));

      expect(migration.collections.map((collection) => collection.name), filename)
        .not.toEqual(expect.arrayContaining(['sessions']));

      for (const collection of migration.collections) {
        expect(collection.name).not.toMatch(/^(?:sessions|session_series|session_exclusions|participation_)/);
      }
    }
  });

  it('does not ship local site content, publication output or demo installers', () => {
    expect(existsSync('sites')).toBe(false);
    expect(existsSync('scripts/configure-participation-demo.mjs')).toBe(false);
    expect(existsSync('vendor')).toBe(false);
  });
});
