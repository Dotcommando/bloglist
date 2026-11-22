import { chunkNameAlias, resolveChunkReference } from '../../../../domain/publication/chunk-reference.policy.js';
import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import {
  ElementUsageKind, type IElementIdentity, type IElementUsage,
} from '../../../../domain/rendering/rendering-element.js';
import type { IListPages } from '../../../../ports/inbound/pages/list-pages.port.js';
import type { IRenderingSourcePort } from '../../../../ports/outbound/publication/rendering-source.port.js';
import type { IElementUsages } from '../../../../ports/outbound/rendering/element-sources.port.js';
import { tokenize } from './tags.js';

export class RenderingElementUsagesAdapter implements IElementUsages {
  constructor(private readonly sources: IRenderingSourcePort, private readonly pages: IListPages) {}

  async find(identity: IElementIdentity): Promise<readonly IElementUsage[]> {
    const sources = await this.sources.read(identity.siteId);
    const pages = await this.pages.execute({ siteId: identity.siteId });

    if (pages.some((page) => page.siteId !== identity.siteId)) {
      throw new Error('Foreign page usage');
    }

    const allChunks = sources.templates.filter((item) => item.kind === TemplateSourceKind.Chunk).map((item) => item.id);
    const graph = new Map<string, readonly string[]>();
    const snippetCalls = new Map<string, Set<string>>();
    const snippets = sources.templates.filter((item) => item.kind === TemplateSourceKind.Snippet);
    const snippetMatches = (reference: string): boolean => {
      const exact = snippets.find((item) => item.id === reference);

      return exact ? exact.id === identity.key
        : snippets.some((item) => item.id === identity.key && item.name && chunkNameAlias(item.name) === reference);
    };

    for (const item of sources.templates) {
      const dependencies = new Set<string>();
      const calls = new Set<string>();
      const include = (reference: string): void => {
        dependencies.add(resolveChunkReference(sources.templates, reference).id);
      };

      try {
        for (const node of tokenize(item.html)) {
          if (!('tag' in node)) {
            continue;
          }
          if (identity.kind === TemplateSourceKind.Snippet && snippetMatches(node.name)) {
            calls.add(identity.key);
          }
          if (node.name.startsWith('$')) {
            include(node.name.slice(1));
          }
          if (node.name === 'Each' && node.parameters.chunk) {
            include(node.parameters.chunk);
          }
          if (node.name === 'If') {
            if (node.parameters.then) {
              include(node.parameters.then);
            }
            if (node.parameters.else) {
              include(node.parameters.else);
            }
          }
        }
      } catch {
        // Incomplete draft syntax must not hide potentially affected pages.
        allChunks.forEach((key) => dependencies.add(key));
        snippets.forEach((item) => calls.add(item.id));
      }
      graph.set(item.kind + ':' + item.id, [...dependencies]);
      snippetCalls.set(item.kind + ':' + item.id, calls);
    }
    const uses = (kind: TemplateSourceKind, key: string, seen = new Set<string>()): boolean => {
      const node = kind + ':' + key;

      if (seen.has(node)) {
        return false;
      }
      seen.add(node);

      if (kind === identity.kind && key === identity.key) {
        return true;
      }
      if (identity.kind === TemplateSourceKind.Snippet && snippetCalls.get(node)?.has(identity.key)) {
        return true;
      }

      return (graph.get(node) ?? []).some((child) => uses(TemplateSourceKind.Chunk, child, seen));
    };
    const result: IElementUsage[] = [];

    for (const item of sources.templates) {
      if ((item.kind !== identity.kind || item.id !== identity.key) && uses(item.kind, item.id)) {
        result.push({
          kind: item.kind === TemplateSourceKind.Template ? ElementUsageKind.Template : ElementUsageKind.Chunk,
          id: item.id,
          title: item.name ?? item.id,
        });
      }
    }

    for (const page of pages) {
      const templateId = page.toState().rendering?.templateId;

      if (
        templateId
        && (uses(TemplateSourceKind.Template, templateId)
        || identity.kind === TemplateSourceKind.Snippet
        && page.toState().rendering?.loaders.some((binding) => snippetMatches(binding.loaderId)))
      ) {
        result.push({ kind: ElementUsageKind.Page, id: page.pageId, title: page.toState().title });
      }
    }

    return result;
  }
}
