import { RoutingConflictError } from '../../../domain/routing/routing-conflict.error.js';
import { routingHookFacts } from '../../../domain/routing/routing-hook-facts.policy.js';
import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { Url } from '../../../domain/routing/url.js';
import { requireText } from '../../../domain/shared/validation.js';
import type { IRedirectUrl, IRedirectUrlInput } from '../../../ports/inbound/routing/redirect-url.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';
import type { IUrlBehaviorStorePort } from '../../../ports/outbound/routing/url-behavior-store.port.js';
import type {
  IUrlBehaviorAccessPort, IUrlBehaviorValuesPort,
} from '../../../ports/outbound/routing/url-behavior-values.port.js';
import { loadBehavior, prepareBehavior } from '../../services/routing/url-behavior.service.js';

export class RedirectUrlUseCase implements IRedirectUrl {
  constructor(private readonly store: IUrlBehaviorStorePort, private readonly urls: IUrlRepository,
    private readonly values: IUrlBehaviorValuesPort, private readonly access: IUrlBehaviorAccessPort,
    private readonly hooks: IHookChangesPort) {}

  async execute(input: IRedirectUrlInput): Promise<Url> {
    await this.access.requireEditor(input.siteId, input.actorId);
    requireText(input.targetUrlId, 'targetUrlId');
    const current = await loadBehavior(this.store, input.siteId, input.urlId, input.expectedVersion);
    const visited = new Set([input.urlId]);
    let targetId: string | null = input.targetUrlId;

    while (targetId !== null) {
      if (visited.has(targetId)) {
        throw new RoutingConflictError('Cyclic redirect');
      }
      visited.add(targetId);
      const target = await this.urls.findById(targetId);

      if (!target) {
        throw new RoutingNotFoundError('Redirect target not found');
      }
      if (target.siteId !== input.siteId || target.urlId !== targetId) {
        throw new RoutingScopeError('Foreign redirect target');
      }
      targetId = target.redirectTargetUrlId;
    }
    const next = new Url(current.url);

    next.redirectTo(input.targetUrlId, input.redirectStatus);
    const change = prepareBehavior(current, next, this.values);

    await this.store.commitBehaviorChange({
      ...change,
      hookChange: await this.hooks.prepare({
        siteId: input.siteId,
        actorId: input.actorId,
        subject: 'routing:' + input.siteId,
        checkKey: 'cms.routing.change.check',
        candidate: { pageId: current.url.pageId },
        facts: routingHookFacts([change.previous], [change.next]),
      }),
    });

    return new Url(change.next);
  }
}
