import { RoutingConflictError } from '../../../domain/routing/routing-conflict.error.js';
import { routingHookFacts } from '../../../domain/routing/routing-hook-facts.policy.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { Url } from '../../../domain/routing/url.js';
import type {
  IAssignInitialPageUrl, IAssignInitialPageUrlInput,
} from '../../../ports/inbound/routing/assign-initial-page-url.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageLookupPort } from '../../../ports/outbound/routing/page-lookup.port.js';
import type { IRoutingAccessPort } from '../../../ports/outbound/routing/routing-access.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';
import type { IUrlCreationValues } from '../../../ports/outbound/routing/url-creation-values.port.js';
import { PageUrlPreparationService } from '../../services/routing/page-url-preparation.service.js';

export class AssignInitialPageUrlUseCase implements IAssignInitialPageUrl {
  private readonly preparation: PageUrlPreparationService;

  constructor(private readonly urls: IUrlRepository, pages: IPageLookupPort, values: IUrlCreationValues,
    private readonly access: IRoutingAccessPort, private readonly hooks: IHookChangesPort) {
    this.preparation = new PageUrlPreparationService(urls, pages, values);
  }

  async execute(input: IAssignInitialPageUrlInput): Promise<Url> {
    await this.access.assertCanAssignPageUrl(input.siteId);
    const url = await this.preparation.prepare(input);
    const current = await this.urls.findCurrentByPage(input.pageId);

    if (current && (current.siteId !== input.siteId || current.pageId !== input.pageId)) {
      throw new RoutingScopeError('Current URL does not match the owned page');
    }
    if (current) {
      throw new RoutingConflictError('Page already has a current URL');
    }

    const saved = await this.urls.save(url, await this.hooks.prepare({
      siteId: input.siteId,
      actorId: 'system',
      subject: 'routing:' + input.siteId,
      checkKey: 'cms.routing.change.check',
      candidate: { pageId: input.pageId ?? null },
      facts: routingHookFacts([], [url.toState()]),
    }));

    if (
      saved.urlId !== url.urlId
      || saved.siteId !== url.siteId
      || saved.pageId !== url.pageId
      || saved.path !== url.path
      || saved.mark !== url.mark
    ) {
      throw new RoutingScopeError('Inconsistent saved URL');
    }

    return new Url(saved.toState());
  }
}
