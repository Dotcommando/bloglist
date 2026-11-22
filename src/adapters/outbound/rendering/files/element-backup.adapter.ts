import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import {
  ElementBackupState, type IRenderingElementState, RenderingElement,
} from '../../../../domain/rendering/rendering-element.js';
import type { IElementBackup } from '../../../../ports/outbound/rendering/element-sources.port.js';
import { elementBackupFilenames, elementBackupStem, readElementBackup } from './element-backup-files.js';
import type { FileRenderingSourceAdapter } from './rendering-source.adapter.js';

export class FileElementBackupAdapter implements IElementBackup {
  constructor(private readonly root: string, private readonly files: FileRenderingSourceAdapter) {}

  private async directory(base: string, parts: readonly string[]): Promise<string> {
    let current = base;

    for (const part of parts) {
      current = path.join(current, part);
      const existing = await lstat(current).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return null;
        }
        throw error;
      });

      if (existing?.isSymbolicLink()) {
        throw new Error('Backup directory cannot be a symbolic link');
      }
      await mkdir(current, { recursive: true });
      const resolved = await realpath(current);

      if (!resolved.startsWith(base + path.sep)) {
        throw new Error('Backup escapes the source root');
      }
    }

    return current;
  }

  async write(input: IRenderingElementState): Promise<void> {
    const element = new RenderingElement(input).toState();

    await mkdir(this.root, { recursive: true });
    const base = await realpath(this.root);
    const match = await this.files.locate(element.siteId);
    const siteKey = match?.key ?? 'Site' + createHash('sha256').update(element.siteId).digest('hex');
    const site = await this.directory(base, [siteKey]);

    if (!match) {
      const configTemporary = path.join(site, 'site.config.' + randomUUID() + '.tmp');

      try {
        await writeFile(configTemporary, JSON.stringify({ siteId: element.siteId }), { flag: 'wx' });
        await link(configTemporary, path.join(site, 'site.config.json')).catch((error: unknown) => {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
            throw error;
          }
        });
      } finally {
        await rm(configTemporary, { force: true });
      }
      const current = await this.files.locate(element.siteId);

      if (current?.key !== siteKey) {
        throw new Error('Source directory ownership changed');
      }
    }

    const directory = await this.directory(base, [siteKey, 'elements',
      element.kind === TemplateSourceKind.Template ? 'templates'
        : element.kind === TemplateSourceKind.Chunk ? 'chunks' : 'snippets']);
    const stem = elementBackupStem(element);
    const temporary = path.join(directory, randomUUID() + '.tmp');
    const owns = (saved: IRenderingElementState): boolean => {
      if (saved.siteId !== element.siteId || saved.kind !== element.kind) {
        throw new Error('Foreign source backup');
      }

      return saved.key === element.key;
    };

    try {
      await writeFile(temporary, JSON.stringify({ ...element, backupState: ElementBackupState.Ready }, null, 2) + '\n',
        { flag: 'wx' });
      let targetName = '';

      for (let suffix = 1; !targetName; suffix++) {
        const candidate = stem + (suffix === 1 ? '' : ' (' + suffix + ')') + '.json';
        const filenames = await elementBackupFilenames(directory);
        const collision = filenames.find((filename) => filename.toLowerCase() === candidate.toLowerCase());

        if (collision) {
          if (!owns(await readElementBackup(path.join(directory, collision), site))) {
            continue;
          }
          targetName = candidate;
          await rename(temporary, path.join(directory, targetName));
          break;
        }

        try {
          await link(temporary, path.join(directory, candidate));
          targetName = candidate;
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
            throw error;
          }
          suffix--;
        }
      }

      const target = await realpath(path.join(directory, targetName));

      for (const filename of await elementBackupFilenames(directory)) {
        if (
          await realpath(path.join(directory, filename)) !== target
          && owns(await readElementBackup(path.join(directory, filename), site))
        ) {
          await rm(path.join(directory, filename));
        }
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
