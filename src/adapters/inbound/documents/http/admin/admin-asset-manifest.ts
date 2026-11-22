import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

interface IAdminBuildEntry {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
  readonly css?: readonly string[];
}

function isBuildEntry(value: unknown): value is IAdminBuildEntry {
  if (!value || typeof value !== 'object' || !('file' in value) || typeof value.file !== 'string') {
    return false;
  }

  const fields = Object.fromEntries(Object.entries(value));

  return (fields.isEntry === undefined || typeof fields.isEntry === 'boolean')
    && [fields.imports, fields.dynamicImports, fields.css].every((references: unknown) =>
      references === undefined || Array.isArray(references)
      && references.every((reference: unknown) => typeof reference === 'string'));
}

/** Only the entry's static dependency graph is public; dynamic imports require a session. */
export async function readAdminPublicAssets(root: string): Promise<ReadonlySet<string>> {
  const filename = path.join(root, '.vite', 'manifest.json');

  if ((await stat(filename)).size > 1024 * 1024) {
    throw new Error('Admin build manifest exceeds its limit');
  }

  const raw: unknown = JSON.parse(await readFile(filename, 'utf8'));

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid admin build manifest');
  }

  const entries = Object.entries(raw);
  const manifest = new Map<string, IAdminBuildEntry>();
  const asset = /^assets\/[A-Za-z0-9_-]+\.(?:js|css)$/;

  if (!entries.length || entries.length > 1024) {
    throw new Error('Invalid admin build manifest size');
  }

  for (const [key, value] of entries) {
    if (!isBuildEntry(value) || !asset.test(value.file)) {
      throw new Error('Invalid admin build asset');
    }

    const row = value;

    if (row.css?.some((file) => !asset.test(file))) {
      throw new Error('Invalid admin stylesheet');
    }
    manifest.set(key, row);
  }
  const roots = [...manifest.values()].filter((entry) => entry.isEntry === true);

  if (roots.length !== 1) {
    throw new Error('Exactly one public administration entry is required');
  }

  const publicAssets = new Set<string>();
  const visited = new Set<IAdminBuildEntry>();
  const visit = (entry: IAdminBuildEntry): void => {
    if (visited.has(entry)) {
      return;
    }
    visited.add(entry);
    publicAssets.add(entry.file);
    entry.css?.forEach((file) => publicAssets.add(file));

    for (const key of entry.imports ?? []) {
      const imported = manifest.get(key);

      if (!imported) {
        throw new Error('Missing admin build dependency');
      }
      visit(imported);
    }
  };

  for (const entry of manifest.values()) {
    if ([...(entry.imports ?? []), ...(entry.dynamicImports ?? [])].some((key) => !manifest.has(key))) {
      throw new Error('Missing admin build dependency');
    }
  }
  visit(roots[0]!);

  return publicAssets;
}
