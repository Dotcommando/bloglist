import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import { effectiveTemplateValues } from '../../../domain/template-variables/template-variable.js';
import type { IPublicationSourcePort } from '../../../ports/outbound/publication/publication-source.port.js';
import type {
  ITemplateVariablePublication,
  ITemplateVariableStore,
} from '../../../ports/outbound/template-variables/template-variables.port.js';

/** Prepares TV inputs once during publication/preview; Request execution uses the frozen plan. */
export class TemplateVariableSourceService implements IPublicationSourcePort {
  constructor(private readonly source: IPublicationSourcePort,
    private readonly projection: ITemplateVariablePublication,
    private readonly definitions: ITemplateVariableStore) {}

  async capture(siteId: string, previewPageId?: string): ReturnType<IPublicationSourcePort['capture']> {
    const snapshot = await this.source.capture(siteId, previewPageId);
    const catalog = previewPageId ? await this.definitions.read(siteId) : null;
    const templateValues: Record<string, ITemplateObject> = {};

    for (const page of snapshot.pages) {
      if ((page.mimeType ?? 'text/html') !== 'text/html') {
        templateValues[page.pageId] = {};
        continue;
      }

      const values = catalog ? effectiveTemplateValues(catalog.fields, page.rendering?.templateId ?? '',
        page.tvValues ?? {})
        : page.tvValues ?? {};

      templateValues[page.pageId] = await this.projection.prepare(siteId, values);
    }
    const publishedPages = snapshot.publishedPages ? await Promise.all(snapshot.publishedPages.map(async (page) => ({
      ...page, tv: await this.projection.prepare(siteId, page.tvValues ?? {}),
    }))) : undefined;

    return { ...snapshot, templateValues, ...(publishedPages ? { publishedPages } : {}) };
  }
}
