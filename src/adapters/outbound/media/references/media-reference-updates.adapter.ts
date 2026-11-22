import {
  mediaReferenceOrigins, mediaReferenceRewriter,
} from '../../../../domain/media/media-reference-rewrite.policy.js';
import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { IListPages } from '../../../../ports/inbound/pages/list-pages.port.js';
import type {
  IRewritePageMediaReferences,
} from '../../../../ports/inbound/pages/rewrite-page-media-references.port.js';
import type { IRenderingOperations } from '../../../../ports/inbound/rendering/rendering-elements.port.js';
import type { IGetSite } from '../../../../ports/inbound/sites/get-site.port.js';
import type {
  ITemplateVariableOperations,
} from '../../../../ports/inbound/template-variables/template-variables.port.js';
import type {
  IMediaPathReplacement, IMediaReferenceUpdates,
} from '../../../../ports/outbound/media/media-reference-updates.port.js';

/** Saves through each capability's operations, including normal guards and private backups. */
export class MediaReferenceUpdatesAdapter implements IMediaReferenceUpdates {
  constructor(private readonly elements: Pick<IRenderingOperations, 'list' | 'update'>,
    private readonly variables: ITemplateVariableOperations, private readonly pages: IListPages,
    private readonly sites: IGetSite, private readonly pageReferences: IRewritePageMediaReferences) {}

  async replace(siteId: string, paths: readonly IMediaPathReplacement[]): Promise<void> {
    if (!paths.length) {
      return;
    }

    const site = await this.sites.execute({ siteId });

    if (site?.siteId !== siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }

    const { text, value: rewrite, object: rewriteObject, parameters } = mediaReferenceRewriter(paths,
      mediaReferenceOrigins(site.toState()));

    for (const kind of [TemplateSourceKind.Template, TemplateSourceKind.Chunk, TemplateSourceKind.Snippet]) {
      for (const source of await this.elements.list.execute({ siteId, kind })) {
        const content = {
          name: source.name,
          html: text(source.html),
          css: text(source.css),
          browserTypeScript: source.browserTypeScript === null ? null : text(source.browserTypeScript),
          parameters: parameters(source.parameters),
          ...(source.snippet ? { snippet: { ...source.snippet, code: text(source.snippet.code) } } : {}),
        };
        const original = {
          name: source.name,
          html: source.html,
          css: source.css,
          browserTypeScript: source.browserTypeScript,
          parameters: source.parameters,
          ...(source.snippet ? { snippet: source.snippet } : {}),
        };

        if (JSON.stringify(content) !== JSON.stringify(original)) {
          await this.elements.update.execute({
            ...content, siteId, kind, key: source.key, expectedVersion: source.version, draftOnly: true,
          });
        }
      }
    }
    const catalog = await this.variables.list.execute({ siteId });
    const fields = catalog.fields.map((field) => ({
      ...field,
      ...(field.defaultValue === undefined ? {} : { defaultValue: rewrite(field.defaultValue) }),
    }));

    if (JSON.stringify(fields) !== JSON.stringify(catalog.fields)) {
      await this.variables.save.execute({ siteId, expectedVersion: catalog.version, fields });
    }

    for (const page of await this.pages.execute({ siteId })) {
      await this.pageReferences.execute({ siteId, pageId: page.pageId, paths });

      if (!page.toState().rendering?.templateId) {
        continue;
      }

      const details = await this.variables.getPage.execute({ siteId, pageId: page.pageId });
      const values = rewriteObject(details.values);

      if (details.templateId && JSON.stringify(values) !== JSON.stringify(details.values)) {
        await this.variables.savePage.execute({
          siteId,
          pageId: page.pageId,
          templateId: details.templateId,
          values,
          expectedUpdatedAt: details.updatedAt,
          catalogVersion: details.catalog.version,
          mediaVersion: details.mediaVersion,
        });
      }
    }
  }
}
