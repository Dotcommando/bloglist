import { OldUrlAction } from '../../../domain/routing/old-url-action.enum.js';
import { RoutingConflictError } from '../../../domain/routing/routing-conflict.error.js';
import { routingHookFacts } from '../../../domain/routing/routing-hook-facts.policy.js';
import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { Url } from '../../../domain/routing/url.js';
import { planUrlGraphChange, planUrlParentChange } from '../../../domain/routing/url-graph-change.policy.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import { ChildrenUrlAction, IncomingRedirectAction } from '../../../domain/routing/url-move-options.js';
import { type IUrlMoveIdentity, planUrlSubtreeMove } from '../../../domain/routing/url-subtree-move.policy.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IChangePageUrl, IChangePageUrlInput } from '../../../ports/inbound/routing/change-page-url.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { IPageLookupPort } from '../../../ports/outbound/routing/page-lookup.port.js';
import type { IRoutingAccessPort } from '../../../ports/outbound/routing/routing-access.port.js';
import type { IRoutingSourcePort } from '../../../ports/outbound/routing/routing-source.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';
import type { IUrlCreationValues } from '../../../ports/outbound/routing/url-creation-values.port.js';
import { PageUrlPreparationService } from '../../services/routing/page-url-preparation.service.js';

export class ChangePageUrlUseCase implements IChangePageUrl {
  private readonly preparation: PageUrlPreparationService;

  constructor(private readonly urls: IUrlRepository, private readonly pages: IPageLookupPort,
    private readonly values: IUrlCreationValues, private readonly access: IRoutingAccessPort, private readonly source:
    IRoutingSourcePort | null = null, private readonly hooks: IHookChangesPort) {
    this.preparation = new PageUrlPreparationService(urls, pages, values);
  }

  async execute(input: IChangePageUrlInput): Promise<Url> {
    await this.access.assertCanChangePageUrl(input.siteId);
    const oldUrlAction = input.oldUrlAction ?? OldUrlAction.Redirect;

    requireCondition(Object.values(OldUrlAction).includes(oldUrlAction), 'Invalid old URL action');
    const childrenAction = input.childrenAction ?? ChildrenUrlAction.Keep;
    const incomingRedirectAction = input.incomingRedirectAction ?? IncomingRedirectAction.Retarget;

    requireCondition(Object.values(ChildrenUrlAction).includes(childrenAction)
      && Object.values(IncomingRedirectAction).includes(incomingRedirectAction), 'Invalid related URL action');
    requireCondition(input.moveSubtree === undefined || typeof input.moveSubtree === 'boolean',
      'moveSubtree must be a boolean');
    const previous = await this.urls.findCurrentByPage(input.pageId);

    if (!previous) {
      throw new RoutingNotFoundError('Current page URL not found');
    }
    if (previous.siteId !== input.siteId || previous.pageId !== input.pageId || previous.kind !== UrlKind.PAGE) {
      throw new RoutingScopeError('Current URL does not match the owned page');
    }
    if (input.expectedUrlId !== undefined && previous.urlId !== input.expectedUrlId) {
      throw new RoutingConflictError('Current page address changed');
    }

    await this.verifyParent(input.parentUrlId, previous);

    if (input.path === previous.path) {
      requireCondition(input.parentUrlId !== previous.parentUrlId, 'No URL changes');
      requireCondition(this.source !== null && !input.moveSubtree && childrenAction === ChildrenUrlAction.Keep
        && oldUrlAction === OldUrlAction.Redirect && incomingRedirectAction === IncomingRedirectAction.Retarget,
      'Parent-only changes must retain addresses');
      const page = await this.pages.findPage(input.siteId, input.pageId);

      if (page?.siteId !== input.siteId || page.pageId !== input.pageId) {
        throw new RoutingNotFoundError('Owned page not found');
      }

      const changedAt = this.values.currentInstant();
      const graphChange = planUrlParentChange(previous, input.parentUrlId,
        await this.source!.readUrls(input.siteId), changedAt);
      const saved = new Url(graphChange.next.find((url) => url.urlId === previous.urlId)!);

      await this.urls.changePageUrl({
        previousUrl: previous.toState(),
        newUrl: saved,
        graphChange,
        hookChange: await this.hooks.prepare({
          siteId: input.siteId,
          actorId: 'system',
          subject: 'routing:' + input.siteId,
          checkKey: 'cms.routing.change.check',
          candidate: { pageId: input.pageId ?? null },
          facts: routingHookFacts(graphChange.previous, graphChange.next),
        }),
        redirectStatus: input.redirectStatus,
        changedAt,
      });

      return saved;
    }

    const replacement = await this.preparation.prepare(input);

    if (input.childrenAction !== undefined || oldUrlAction === OldUrlAction.Delete) {
      requireCondition(this.source !== null && !input.moveSubtree, 'Explicit URL graph source is required');
      const captured = await this.source!.readUrls(input.siteId);
      const prefix = previous.path.endsWith('/') ? previous.path : previous.path + '/';
      const descendants = captured.filter((url) => url.urlId !== previous.urlId && url.path.startsWith(prefix));
      const identities = new Map<string, IUrlMoveIdentity>();

      if (childrenAction !== ChildrenUrlAction.Keep) {
        for (const url of descendants) {
          identities.set(url.urlId, { urlId: this.values.nextUrlId(), mark: this.values.nextUrlMark() });
        }
      }

      const graphChange = planUrlGraphChange(previous, replacement, captured, identities, {
        oldUrlAction, childrenAction, incomingRedirectAction, redirectStatus: input.redirectStatus,
      });
      const originalIds = new Set(captured.map((url) => url.urlId));

      for (const url of graphChange.next.filter((url) => !originalIds.has(url.urlId) && url.urlId
        !== replacement.urlId)) {
        if (await this.urls.findByMark(url.mark) || await this.urls.findByPath(input.siteId, url.path)) {
          throw new RoutingConflictError('A descendant destination is occupied');
        }
      }
      const final = new Url(graphChange.next.find((url) => url.urlId === replacement.urlId)!);

      await this.urls.changePageUrl({
        previousUrl: previous.toState(),
        newUrl: final,
        oldUrlAction,
        graphChange,
        hookChange: await this.hooks.prepare({
          siteId: input.siteId,
          actorId: 'system',
          subject: 'routing:' + input.siteId,
          checkKey: 'cms.routing.change.check',
          candidate: { pageId: input.pageId ?? null },
          facts: routingHookFacts(graphChange.previous, graphChange.next),
        }),
        redirectStatus: input.redirectStatus,
        changedAt: replacement.updatedAt,
      });

      return final;
    }

    const descendants = input.moveSubtree === true ? await this.readDescendants(previous) : [];
    const identities = new Map<string, IUrlMoveIdentity>();

    for (const url of descendants) {
      if (url.kind === UrlKind.PAGE && url.pageId !== null) {
        const page = await this.pages.findPage(input.siteId, url.pageId);

        if (!page) {
          throw new RoutingNotFoundError('Descendant page not found');
        }
        if (page.siteId !== input.siteId || page.pageId !== url.pageId) {
          throw new RoutingScopeError('Descendant page does not match');
        }
      }
      identities.set(url.urlId, { urlId: this.values.nextUrlId(), mark: this.values.nextUrlMark() });
    }
    const moves = planUrlSubtreeMove(previous, replacement, descendants, identities);

    for (const move of moves) {
      if (
        await this.urls.findByMark(move.newUrl.mark)
        || await this.urls.findByPath(input.siteId, move.newUrl.path)
      ) {
        throw new RoutingConflictError('A descendant destination is occupied');
      }
    }
    await this.urls.changePageUrl({
      oldUrlAction,
      hookChange: await this.hooks.prepare({
        siteId: input.siteId,
        actorId: 'system',
        subject: 'routing:' + input.siteId,
        checkKey: 'cms.routing.change.check',
        candidate: { pageId: input.pageId ?? null },
        facts: routingHookFacts([previous.toState(), ...descendants.map(url => url.toState())], [{
          ...previous.toState(),
          kind: UrlKind.REDIRECT,
          pageId: null,
          redirectTargetUrlId: replacement.urlId,
          redirectStatus: input.redirectStatus,
        }, replacement.toState(), ...moves.flatMap(move => [{
          ...move.previousUrl,
          kind: UrlKind.REDIRECT,
          pageId: null,
          redirectTargetUrlId: move.newUrl.urlId,
          redirectStatus: input.redirectStatus,
        }, move.newUrl.toState()])]),
      }),
      previousUrl: previous.toState(),
      newUrl: replacement,
      redirectStatus: input.redirectStatus,
      changedAt: replacement.firstPublishedAt,
      moveSubtree: input.moveSubtree === true,
      descendants: moves,
    });

    return new Url(replacement.toState());
  }

  private async verifyParent(parentUrlId: string | null, previous: Url): Promise<void> {
    const visited = new Set<string>();
    let next = parentUrlId;

    while (next !== null) {
      if (next === previous.urlId || visited.has(next)) {
        throw new RoutingConflictError('New parent is inside the old subtree or a cyclic hierarchy');
      }
      visited.add(next);
      const parent = await this.urls.findById(next);

      if (!parent) {
        throw new RoutingNotFoundError('Parent disappeared');
      }
      if (parent.urlId !== next || parent.siteId !== previous.siteId) {
        throw new RoutingScopeError('Parent hierarchy crosses site ownership');
      }
      next = parent.parentUrlId;
    }
  }

  private async readDescendants(root: Url): Promise<Url[]> {
    const result: Url[] = [];
    const queue = [root.urlId];
    const visited = new Set(queue);

    for (const parentId of queue) {
      const children = await this.urls.findChildren(parentId);

      for (const child of children) {
        if (visited.has(child.urlId)) {
          throw new RoutingConflictError('Repeated or cyclic descendant');
        }
        if (child.siteId !== root.siteId || child.parentUrlId !== parentId) {
          throw new RoutingScopeError('Descendant identity or site does not match');
        }
        visited.add(child.urlId);
        queue.push(child.urlId);
        result.push(new Url(child.toState()));
      }
    }

    return result;
  }
}
