import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import type {
  IRenderingSourcePort, IRenderingSources,
} from '../../../../ports/outbound/publication/rendering-source.port.js';
import type { IElementStore } from '../../../../ports/outbound/rendering/element-store.port.js';
import type { FileRenderingSourceAdapter } from './rendering-source.adapter.js';

export class ManagedRenderingSourceAdapter implements IRenderingSourcePort {
  constructor(private readonly store: IElementStore, private readonly files: FileRenderingSourceAdapter) {}

  async read(siteId: string): Promise<IRenderingSources> {
    const stored = await this.store.list(siteId);

    if (stored.some((element) => element.siteId !== siteId)) {
      throw new Error('Foreign rendering entity');
    }

    const base = await this.files.readExcluding(siteId, stored);

    return {
      ...base,
      templates: [...base.templates, ...stored.map((element) => ({
        id: element.key,
        name: element.name,
        kind: element.kind,
        revision: element.version,
        html: element.html,
        parameters: element.parameters,
        ...(element.snippet ? { snippet: element.snippet } : {}),
        ...(element.kind === TemplateSourceKind.Snippet ? {} : {
          frontendSourceId: (element.kind === TemplateSourceKind.Template ? 'templates/' : 'chunks/') + element.key,
        }),
      }))],
      frontendSources: [...base.frontendSources, ...stored
        .filter((element) => element.kind !== TemplateSourceKind.Snippet)
        .map((element) => ({
          id: (element.kind === TemplateSourceKind.Template ? 'templates/' : 'chunks/') + element.key,
          revision: element.version,
          css: element.css,
          browserTypeScript: element.browserTypeScript,
        }))],
    };
  }
}

