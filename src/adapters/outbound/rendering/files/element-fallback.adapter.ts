import { createHash } from 'node:crypto';

import {
  ElementBackupState, type IElementIdentity, type IRenderingElementState,
} from '../../../../domain/rendering/rendering-element.js';
import type { IElementFallback } from '../../../../ports/outbound/rendering/element-sources.port.js';
import type { FileRenderingSourceAdapter } from './rendering-source.adapter.js';

export class FileElementFallbackAdapter implements IElementFallback {
  constructor(private readonly files: FileRenderingSourceAdapter) {}

  async list(siteId: string, excluded: readonly IElementIdentity[]): Promise<readonly IRenderingElementState[]> {
    const sources = await this.files.readExcluding(siteId, excluded);
    const backups = await this.files.readBackups(siteId, excluded);
    const result: IRenderingElementState[] = [];

    for (const template of sources.templates) {
      const frontend = sources.frontendSources.find((item) => item.id === template.frontendSourceId);
      const saved = backups.find((element) => element.kind === template.kind && element.key === template.id);

      if (saved) {
        result.push(saved);
        continue;
      }

      const content = {
        name: template.name ?? template.id,
        html: template.html,
        css: frontend?.css ?? '',
        browserTypeScript: frontend?.browserTypeScript ?? null,
        parameters: template.parameters,
        ...(template.snippet ? { snippet: template.snippet } : {}),
      };

      result.push({
        ...content,
        siteId,
        key: template.id,
        kind: template.kind,
        elementId: 'File' + createHash('sha256').update(siteId + ':' + template.kind + ':' + template.id).digest('hex'),
        version: createHash('sha256').update(JSON.stringify(content)).digest('hex'),
        createdAt: new Date(0),
        updatedAt: new Date(0),
        backupState: ElementBackupState.Ready,
      });
    }

    return result;
  }
}
