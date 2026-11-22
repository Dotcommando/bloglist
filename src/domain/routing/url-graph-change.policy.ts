import { isSystemDocumentPath } from '../pages/document-mime.js';
import { OldUrlAction } from './old-url-action.enum.js';
import { RoutingConflictError } from './routing-conflict.error.js';
import { type IUrlState, Url } from './url.js';
import { UrlKind } from './url-kind.enum.js';
import { ChildrenUrlAction, IncomingRedirectAction } from './url-move-options.js';
import type { IUrlMoveIdentity } from './url-subtree-move.policy.js';

export interface IUrlGraphChange { readonly previous: readonly IUrlState[]; readonly next: readonly IUrlState[]; }

export function planUrlParentChange(root: Url, parentUrlId: string | null, originals: readonly IUrlState[],
  at: Date): IUrlGraphChange {
  if (isSystemDocumentPath(root.path)) {
    throw new RoutingConflictError('System document URLs are fixed');
  }
  validateUrlGraph(root.siteId, originals);

  if (JSON.stringify(originals.find((url) => url.urlId === root.urlId)) !== JSON.stringify(root.toState())) {
    throw new RoutingConflictError('URL changed while capturing its parent');
  }

  const next = originals.map((url) => url.urlId === root.urlId
    ? new Url({ ...url, parentUrlId, updatedAt: at }).toState() : url);

  validateUrlGraph(root.siteId, next);

  return { previous: originals, next };
}

export function validateUrlGraph(siteId: string, urls: readonly IUrlState[]): void {
  const entries = new Map(urls.map((url) => [url.urlId, new Url(url).toState()]));

  if (
    entries.size !== urls.length
    || new Set(urls.map((url) => url.path)).size !== urls.length
    || new Set(urls.map((url) => url.mark.toLowerCase())).size !== urls.length
    || urls.some((url) => url.siteId !== siteId)
  ) {
    throw new RoutingConflictError('Invalid URL graph scope or uniqueness');
  }

  const pageIds = urls.filter((url) => url.kind === UrlKind.PAGE).map((url) => url.pageId);

  if (new Set(pageIds).size !== pageIds.length) {
    throw new RoutingConflictError('Duplicate current page URL');
  }

  for (const url of urls) {
    const relationships: (keyof Pick<IUrlState, 'parentUrlId' | 'redirectTargetUrlId'>)[] =
      ['parentUrlId', 'redirectTargetUrlId'];

    for (const key of relationships) {
      const visited = new Set([url.urlId]);
      let id = url[key];

      while (id !== null) {
        const target = entries.get(id);

        if (!target || visited.has(id)) {
          throw new RoutingConflictError('Missing or cyclic URL relationship');
        }
        visited.add(id);
        id = target[key];
      }
    }
  }
}

export function planUrlGraphChange(root: Url, replacement: Url, originals: readonly IUrlState[],
  identities: ReadonlyMap<string, IUrlMoveIdentity>, options: {
    oldUrlAction: OldUrlAction;
    childrenAction: ChildrenUrlAction;
    incomingRedirectAction: IncomingRedirectAction;
    redirectStatus: 301 | 308;
  }): IUrlGraphChange {
  if (isSystemDocumentPath(root.path)) {
    throw new RoutingConflictError('System document URLs are fixed');
  }
  validateUrlGraph(root.siteId, originals);
  const original = new Map(originals.map((url) => [url.urlId, url]));

  if (JSON.stringify(original.get(root.urlId)) !== JSON.stringify(root.toState())) {
    throw new RoutingConflictError('Root changed while capturing the URL graph');
  }

  const next = new Map(originals.map((url) => [url.urlId, new Url(url).toState()]));
  const replacements = new Map<string, IUrlState>([[root.urlId, replacement.toState()]]);
  const prefix = root.path.endsWith('/') ? root.path : root.path + '/';
  const descendants = originals.filter((url) => url.urlId !== root.urlId && url.path.startsWith(prefix));
  const trimmed = root.path.endsWith('/') ? root.path.slice(0, -1) : root.path;
  const parentPrefix = trimmed.slice(0, trimmed.lastIndexOf('/') + 1);

  if (options.childrenAction !== ChildrenUrlAction.Keep) {
    if (root.path === '/') {
      throw new RoutingConflictError('Root children cannot be promoted');
    }

    for (const url of descendants) {
      const identity = identities.get(url.urlId);

      if (!identity || !url.path.startsWith(prefix)) {
        throw new RoutingConflictError('Invalid descendant path');
      }

      const parent = url.parentUrlId === root.urlId ? root.parentUrlId
        : identities.get(url.parentUrlId ?? '')?.urlId ?? url.parentUrlId;

      replacements.set(url.urlId, new Url({
        ...url,
        ...identity,
        parentUrlId: parent,
        path: parentPrefix + url.path.slice(prefix.length),
        createdAt: replacement.createdAt,
        firstPublishedAt: replacement.firstPublishedAt,
        updatedAt: replacement.updatedAt,
      }).toState());
    }
  }

  const removed = new Map<string, string>();

  for (const [id, url] of replacements) {
    if (url.redirectTargetUrlId !== null && replacements.has(url.redirectTargetUrlId)) {
      replacements.set(id, { ...url, redirectTargetUrlId: replacements.get(url.redirectTargetUrlId)!.urlId });
    }
  }

  for (const [id, url] of replacements) {
    const remove = id === root.urlId ? options.oldUrlAction === OldUrlAction.Delete
      : options.childrenAction === ChildrenUrlAction.PromoteWithoutRedirect;

    if (remove) {
      next.delete(id);
      removed.set(id, url.urlId);
    } else {
      const redirect = new Url(original.get(id)!);

      redirect.redirectTo(url.urlId, options.redirectStatus);
      next.set(id, { ...redirect.toState(), updatedAt: replacement.updatedAt });
    }
    next.set(url.urlId, url);
  }
  const incoming = new Map<string, string>();
  const removedIds = new Set(removed.keys());

  for (const url of next.values()) {
    if (url.kind !== UrlKind.REDIRECT) {
      continue;
    }

    let id = url.redirectTargetUrlId;
    const visited = new Set([url.urlId]);

    while (id !== null && !removedIds.has(id)) {
      if (visited.has(id)) {
        throw new RoutingConflictError('Cyclic redirect');
      }
      visited.add(id);
      const target = next.get(id);

      if (target?.kind !== UrlKind.REDIRECT) {
        id = null;
        break;
      }
      id = target.redirectTargetUrlId;
    }

    if (id !== null) {
      incoming.set(url.urlId, removed.get(id)!);
    }
  }

  for (const [id, target] of incoming) {
    if (options.incomingRedirectAction === IncomingRedirectAction.Delete) {
      next.delete(id);
    } else {
      next.set(id, { ...next.get(id)!, redirectTargetUrlId: target, updatedAt: replacement.updatedAt });
    }
  }

  for (const [id, url] of next) {
    let parent = url.parentUrlId;
    const visited = new Set<string>();

    while (parent !== null && !next.has(parent)) {
      if (visited.has(parent)) {
        throw new RoutingConflictError('Cyclic removed parent');
      }
      visited.add(parent);
      parent = removed.get(parent) ?? original.get(parent)?.parentUrlId ?? null;
    }
    let target = url.redirectTargetUrlId;

    if (target !== null && removed.has(target)) {
      target = removed.get(target)!;
    }
    if (parent !== url.parentUrlId || target !== url.redirectTargetUrlId) {
      next.set(id, { ...url, parentUrlId: parent, redirectTargetUrlId: target, updatedAt: replacement.updatedAt });
    }
  }
  const result = [...next.values()];

  validateUrlGraph(root.siteId, result);

  return { previous: originals, next: result };
}
