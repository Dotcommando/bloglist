import { createHash } from 'node:crypto';
import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { loadConfigFromFile } from 'vite';

import type { ITemplateObject } from '../../../../domain/pages/page-rendering.js';
import {
  type IFrontendSource, type ITemplateSource,
  TemplateSourceKind,
} from '../../../../domain/publication/render-plan.js';
import {
  type IElementIdentity, type IRenderingElementState, isElementKey,
} from '../../../../domain/rendering/rendering-element.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type {
  IRenderingSourcePort,
  IRenderingSources,
} from '../../../../ports/outbound/publication/rendering-source.port.js';
import { contracts } from '../modx/parameter-contracts.js';
import { isTemplateObject } from '../modx/parameters.js';
import { elementBackupFilenames, elementBackupStem, readElementBackup } from './element-backup-files.js';

export class FileRenderingSourceAdapter implements IRenderingSourcePort {
  constructor(private readonly root: string, private readonly registered?: IRenderingSourcePort) {}

  private async safe(filename: string, siteDirectory?: string): Promise<string> {
    const base = await realpath(siteDirectory ?? this.root);
    const resolved = await realpath(filename);

    requireCondition(resolved.startsWith(`${base}${path.sep}`), 'Source escapes the configured site root');

    return resolved;
  }

  private async config(filename: string, siteDirectory?: string): Promise<ITemplateObject> {
    if (filename.endsWith('.json')) {
      const value: unknown = JSON.parse(await readFile(await this.safe(filename, siteDirectory), 'utf8'));

      requireCondition(isTemplateObject(value), 'Expected data-only site configuration');

      if (!isTemplateObject(value)) {
        throw new Error('Invalid site configuration');
      }

      return value;
    }

    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' },
      await this.safe(filename, siteDirectory), this.root);
    const value: unknown = loaded?.config;

    requireCondition(isTemplateObject(value), 'Expected a trusted config object');

    if (!isTemplateObject(value)) {
      throw new Error('Expected config');
    }

    return value;
  }

  private async optional(filename: string, siteDirectory?: string): Promise<string> {
    try {
      return await readFile(await this.safe(filename, siteDirectory), 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  }

  async locate(siteId: string): Promise<{ key: string; config: ITemplateObject } | null> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    });
    const matches: { key: string; config: ITemplateObject }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(entry.name)) {
        continue;
      }

      let filename: string | null = null;

      for (const name of ['site.config.ts', 'site.config.json']) {
        try {
          filename = await this.safe(path.join(this.root, entry.name, name));
          break;
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
            throw error;
          }
        }
      }

      if (!filename) {
        continue;
      }

      const config = await this.config(filename);

      if (config.siteId === siteId) {
        matches.push({ key: entry.name, config });
      }
    }

    requireCondition(matches.length <= 1, 'Expected exactly one configured source directory for this site');

    return matches[0] ?? null;
  }

  async read(siteId: string): Promise<IRenderingSources> {
    return this.readExcluding(siteId, []);
  }

  async readBackups(siteId: string, excluded: readonly IElementIdentity[]): Promise<readonly IRenderingElementState[]> {
    const match = await this.locate(siteId);

    if (!match) {
      return [];
    }

    const directory = path.join(this.root, match.key);
    const result = new Map<string, IRenderingElementState>();

    for (const [group, kind] of [
      ['templates', TemplateSourceKind.Template], ['chunks', TemplateSourceKind.Chunk],
      ['snippets', TemplateSourceKind.Snippet],
    ] as const) {
      const backupDirectory = path.join(directory, 'elements', group);

      for (const filename of await elementBackupFilenames(backupDirectory)) {
        if (
          kind === TemplateSourceKind.Template
          && excluded.some((item) => item.kind === kind
          && item.key === filename.slice(0, -5))
        ) {
          continue;
        }

        let element: IRenderingElementState;

        try {
          element = await readElementBackup(path.join(backupDirectory, filename), directory);
        } catch (error) {
          const primary = excluded.some((item) => {
            if (item.kind !== kind || !('name' in item) || typeof item.name !== 'string') {
              return false;
            }

            const stem = elementBackupStem({ ...item, name: item.name });

            return filename.toLowerCase() === (stem + '.json').toLowerCase()
              || filename.toLowerCase().startsWith(stem.toLowerCase())
                && /^ \([1-9][0-9]*\)\.json$/.test(filename.slice(stem.length));
          });

          if (error instanceof SyntaxError && primary) {
            continue;
          }
          throw error;
        }

        if (excluded.some((item) => item.kind === kind && item.key === element.key)) {
          continue;
        }
        requireCondition(element.siteId === siteId && element.kind === kind, 'Foreign source backup');
        const identity = kind + ':' + element.key;
        const previous = result.get(identity);

        requireCondition(!previous || previous.elementId === element.elementId, 'Duplicate source backup');

        if (!previous || element.updatedAt >= previous.updatedAt) {
          result.set(identity, element);
        }
      }
    }

    return [...result.values()];
  }

  async readExcluding(siteId: string, excluded: readonly IElementIdentity[]): Promise<IRenderingSources> {
    const registered = await this.registered?.read(siteId);
    const match = await this.locate(siteId);
    const skip = new Set(excluded.map((item) => item.kind + ':' + item.key));

    if (!match && registered) {
      return { ...registered, templates: registered.templates.filter((item) => !skip.has(item.kind + ':' + item.id)) };
    }
    requireCondition(match !== null, 'Expected a configured source directory for this site');

    if (!match) {
      throw new Error('Site source not found');
    }

    const directory = path.join(this.root, match.key);
    const templates: ITemplateSource[] = [];
    const frontendSources: IFrontendSource[] = [];

    for (const element of await this.readBackups(siteId, excluded)) {
      const { key, kind } = element;
      const group = kind === TemplateSourceKind.Template ? 'templates'
        : kind === TemplateSourceKind.Chunk ? 'chunks' : 'snippets';

      skip.add(kind + ':' + key);
      const frontendSourceId = group + '/' + key;

      templates.push({
        id: key,
        name: element.name,
        kind,
        revision: element.version,
        html: element.html,
        parameters: element.parameters,
        ...(element.snippet ? { snippet: element.snippet } : { frontendSourceId }),
      });

      if (kind === TemplateSourceKind.Snippet) {
        continue;
      }
      frontendSources.push({
        id: frontendSourceId,
        revision: element.version,
        css: element.css,
        browserTypeScript: element.browserTypeScript,
      });
    }
    const addFrontend = async (id: string, owner: string): Promise<void> => {
      const css = await this.optional(path.join(owner, 'styles.css'), directory);
      const browserTypeScript = await this.optional(path.join(owner, 'client.ts'), directory);

      frontendSources.push({
        id,
        revision: createHash('sha256').update(css + browserTypeScript).digest('hex'),
        css,
        browserTypeScript: browserTypeScript || null,
      });
    };

    await addFrontend('site', directory);
    let pageKeys: string[] = [];

    try {
      pageKeys = await readdir(path.join(directory, 'pages'));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
    }

    for (const key of pageKeys.sort()) {
      requireCondition(/^[A-Za-z][A-Za-z0-9]*$/.test(key), 'Page source keys must match immutable page marks');
      await addFrontend(`pages/${key}`, path.join(directory, 'pages', key));
    }

    for (const [group, kind] of [['templates', TemplateSourceKind.Template], ['chunks',
      TemplateSourceKind.Chunk]] satisfies readonly (readonly [string, TemplateSourceKind])[]) {
      let owners: string[];

      try {
        owners = await readdir(path.join(directory, group));
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          continue;
        }
        throw error;
      }

      for (const id of owners.sort()) {
        requireCondition(isElementKey(id), 'Invalid template/chunk key');

        if (skip.has(kind + ':' + id)) {
          continue;
        }

        const owner = path.join(directory, group, id);
        const html = await readFile(await this.safe(path.join(owner, 'index.html'), directory), 'utf8');
        const config = kind === TemplateSourceKind.Chunk
          ? await this.config(path.join(owner, 'chunk.config.ts'), directory)
          : (isTemplateObject(match.config.templates) && isTemplateObject(match.config.templates[id])
            ? match.config.templates[id] : {});
        const frontendSourceId = `${group}/${id}`;

        templates.push({
          id,
          kind,
          html,
          revision: createHash('sha256').update(html).digest('hex'),
          parameters: contracts(config.parameters ?? []),
          frontendSourceId,
        });
        await addFrontend(frontendSourceId, owner);
      }
    }
    requireCondition(isTemplateObject(match.config.publicSettings ?? {}), 'Expected public site settings');
    const settings = match.config.publicSettings ?? {};

    if (!isTemplateObject(settings)) {
      throw new Error('Invalid public settings');
    }

    const provided = (registered?.templates ?? []).filter((item) => !skip.has(item.kind + ':' + item.id));
    const combined = [...templates, ...provided];

    requireCondition(new Set(combined.map((template) => `${template.kind}:${template.id}`)).size === combined.length,
      'Duplicate registered template/chunk');

    return {
      siteKey: match.key,
      settings,
      templates: combined,
      frontendSources: [...frontendSources, ...(registered?.frontendSources ?? [])
        .filter((source) => !frontendSources.some((item) => item.id === source.id))],
      requestParameters: contracts(match.config.requestParameters ?? []),
    };
  }
}
