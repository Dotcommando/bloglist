import { RoutingConflictError } from '../../../domain/routing/routing-conflict.error.js';
import { routingHookFacts } from '../../../domain/routing/routing-hook-facts.policy.js';
import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { Url } from '../../../domain/routing/url.js';
import { requireText } from '../../../domain/shared/validation.js';
import type {
  IRebindUrlToPage, IRebindUrlToPageInput,
} from '../../../ports/inbound/routing/rebind-url-to-page.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageLookupPort } from '../../../ports/outbound/routing/page-lookup.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';
import type { IUrlBehaviorStorePort } from '../../../ports/outbound/routing/url-behavior-store.port.js';
import type {
  IUrlBehaviorAccessPort, IUrlBehaviorValuesPort,
} from '../../../ports/outbound/routing/url-behavior-values.port.js';
import { loadBehavior, prepareBehavior } from '../../services/routing/url-behavior.service.js';

export class RebindUrlToPageUseCase implements IRebindUrlToPage {
  constructor(private readonly store: IUrlBehaviorStorePort, private readonly urls: IUrlRepository,
    private readonly pages: IPageLookupPort, private readonly values: IUrlBehaviorValuesPort, private readonly access:
    IUrlBehaviorAccessPort, private readonly hooks: IHookChangesPort) {}

  async execute(input: IRebindUrlToPageInput): Promise<Url> {
    await this.access.requireEditor(input.siteId, input.actorId);
    requireText(input.replacementPageId, 'replacementPageId');
    const current = await loadBehavior(this.store, input.siteId, input.urlId, input.expectedVersion);
    const page = await this.pages.findPage(input.siteId, input.replacementPageId);

    if (!page) {
      throw new RoutingNotFoundError('Replacement page not found');
    }
    if (page.siteId !== input.siteId || page.pageId !== input.replacementPageId) {
      throw new RoutingScopeError('Foreign replacement page');
    }

    const occupied = await this.urls.findCurrentByPage(input.replacementPageId);

    if (occupied && (occupied.siteId !== input.siteId || occupied.urlId !== input.urlId)) {
      throw new RoutingConflictError('Replacement page already has a current URL');
    }

    const next = new Url(current.url);

    next.bindToPage(page.pageId);
    const change = prepareBehavior(current, next, this.values);

    await this.store.commitBehaviorChange({
      ...change,
      hookChange: await this.hooks.prepare({
        siteId: input.siteId,
        actorId: input.actorId,
        subject: 'routing:' + input.siteId,
        checkKey: 'cms.routing.change.check',
        candidate: { pageId: input.replacementPageId },
        facts: routingHookFacts([change.previous], [change.next]),
      }),
    });

    return new Url(change.next);
  }
}
