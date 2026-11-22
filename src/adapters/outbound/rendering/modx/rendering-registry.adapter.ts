import type { IPageState } from '../../../../domain/pages/page.js';
import { validatePageRendering } from '../../../../domain/pages/page-rendering.policy.js';
import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type { IDataLoader } from '../../../../ports/outbound/publication/data-loader.port.js';
import type { IRenderingRegistryPort } from '../../../../ports/outbound/publication/rendering-registry.port.js';
import type { IRenderingSourcePort } from '../../../../ports/outbound/publication/rendering-source.port.js';
import { validateParameters } from './parameters.js';
import { snippetRegistrations } from './script-snippet.adapter.js';
import { ModxCompositionAdapter } from './template-composition.adapter.js';

export class RenderingRegistryAdapter implements IRenderingRegistryPort {
  constructor(private readonly sources: IRenderingSourcePort, private readonly loaders: readonly IDataLoader[]) {
    requireCondition(new Set(loaders.map((loader) => loader.id)).size === loaders.length, 'Duplicate loader key');
  }

  async validate(page: IPageState): Promise<void> {
    if ((page.mimeType ?? 'text/html') !== 'text/html') {
      return;
    }

    const rendering = page.rendering;

    requireCondition(rendering !== undefined, 'Page needs a rendering configuration');

    if (!rendering) {
      throw new Error('Missing rendering');
    }
    validatePageRendering(rendering);
    const sources = await this.sources.read(page.siteId);
    const loaders = snippetRegistrations(sources.templates, this.loaders);
    const template = sources.templates.find((source) => source.id === rendering.templateId
      && source.kind === TemplateSourceKind.Template);

    requireCondition(template !== undefined, `Unknown template: ${rendering.templateId}`);

    if (template) {
      validateParameters(template.parameters, rendering.parameters);
    }

    for (const binding of rendering.loaders) {
      const loader = loaders.find((loader) => loader.id === binding.loaderId);

      requireCondition(loader !== undefined, `Unknown loader: ${binding.loaderId}`);

      if (!loader) {
        throw new Error('Unknown loader');
      }
      requireCondition(loader.phases.includes(binding.phase), 'Loader does not support this phase');
      requireCondition(binding.required || loader.fallback !== undefined, 'Optional loader requires a fallback');
      validateParameters(loader.parameters, binding.parameters);
    }
    await new ModxCompositionAdapter(this.loaders).prepare({
      ...sources,
      siteId: page.siteId,
      pages: [page],
      urls: [],
    }, page.pageId);
  }
}
