import { Page } from '../../../domain/pages/page.js';
import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import type {
  IConfigurePageRendering,
  IConfigurePageRenderingInput,
} from '../../../ports/inbound/pages/configure-page-rendering.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';
import type { IRenderingRegistryPort } from '../../../ports/outbound/publication/rendering-registry.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class ConfigurePageRenderingUseCase implements IConfigurePageRendering {
  constructor(private readonly pages: IPageRepository, private readonly access: IPublicationAccessPort,
    private readonly registry: IRenderingRegistryPort, private readonly hooks: IHookChangesPort) {}

  async execute(input: IConfigurePageRenderingInput): Promise<Page> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const found = await this.pages.findById(input.pageId);

    if (!found) {
      throw new PageNotFoundError('Page not found');
    }
    if (found.siteId !== input.siteId || found.pageId !== input.pageId) {
      throw new PageScopeError('Page identity or site does not match');
    }

    const page = new Page(found.toState());

    page.configureRendering(input.rendering);
    page.editDraft();
    await this.registry.validate(page.toState());
    const saved = await this.pages.save(page, await prepareCoreHook(this.hooks, input.siteId, page.pageId,
      'cms.page.configure-rendering.check', { pageId: page.pageId, templateId: input.rendering.templateId },
      'cms.page.rendering.configured', input.actorId), found.toState());

    if (saved.siteId !== input.siteId || saved.pageId !== input.pageId) {
      throw new PageScopeError('Inconsistent saved page identity');
    }

    return saved;
  }
}
