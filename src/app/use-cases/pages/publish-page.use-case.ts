import type { Page } from '../../../domain/pages/page.js';
import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import type { IPublishPage, IPublishPageInput } from '../../../ports/inbound/pages/publish-page.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageLifecycleValues } from '../../../ports/outbound/pages/page-lifecycle-values.port.js';
import type { IPagePublicationPort } from '../../../ports/outbound/pages/page-publication.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IRenderingRegistryPort } from '../../../ports/outbound/publication/rendering-registry.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class PublishPageUseCase implements IPublishPage {
  constructor(private readonly pages: IPageRepository, private readonly access: IPublicationAccessPort,
    private readonly publications: IPagePublicationPort, private readonly values: IPageLifecycleValues,
    private readonly registry: IRenderingRegistryPort, private readonly hooks: IHookChangesPort) {}

  async execute(input: IPublishPageInput): Promise<Page> {
    await this.access.assertEditor(input.siteId);
    const page = await this.pages.findById(input.pageId);

    if (!page) {
      throw new PageNotFoundError('Page not found');
    }
    if (page.siteId !== input.siteId || page.pageId !== input.pageId) {
      throw new PageScopeError('Foreign page');
    }
    await this.registry.validate(page.toState());
    const result = await this.publications.publish(page.toState(), this.values.currentInstant(), await
    prepareCoreHook(this.hooks, input.siteId, input.pageId, 'cms.page.publish-version.check', {
      pageId:
      input.pageId,
    }, 'cms.page.version.published', 'system'));

    if (result.siteId !== input.siteId || result.pageId !== input.pageId) {
      throw new PageScopeError('Foreign publication result');
    }

    return result;
  }
}
