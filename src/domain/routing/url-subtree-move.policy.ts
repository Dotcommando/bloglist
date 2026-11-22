import { RoutingConflictError } from './routing-conflict.error.js';
import { type IUrlState, Url } from './url.js';

export interface IUrlMoveIdentity {
  readonly urlId: string;
  readonly mark: string;
}

export interface IUrlRelocation {
  readonly previousUrl: IUrlState;
  readonly newUrl: Url;
}

export function planUrlSubtreeMove(root: Url, replacement: Url, descendants: readonly Url[],
  identities: ReadonlyMap<string, IUrlMoveIdentity>): readonly IUrlRelocation[] {
  const mapping = new Map(identities);

  mapping.set(root.urlId, { urlId: replacement.urlId, mark: replacement.mark });
  const oldPrefix = root.path.endsWith('/') ? root.path : `${root.path}/`;
  const newPrefix = replacement.path.endsWith('/') ? replacement.path : `${replacement.path}/`;
  const occupied = new Set([replacement.path]);
  const originals = new Map(descendants.map((url) => [url.urlId, url]));

  if (
    originals.size !== descendants.length
    || originals.has(root.urlId)
    || new Set([...mapping.values()].map((identity) => identity.urlId)).size !== descendants.length + 1
  ) {
    throw new RoutingConflictError('Invalid subtree identities');
  }

  return descendants.map((url) => {
    const identity = mapping.get(url.urlId);
    const parent = url.parentUrlId === null ? undefined : mapping.get(url.parentUrlId);

    if (
      !identity
      || !parent
      || url.siteId !== root.siteId
      || !url.path.startsWith(oldPrefix)
      || mapping.has(identity.urlId)
    ) {
      throw new RoutingConflictError('Descendant cannot be relocated under the requested prefix');
    }

    const visited = new Set([url.urlId]);
    let ancestor = url.parentUrlId;

    while (ancestor !== root.urlId) {
      if (ancestor === null || visited.has(ancestor)) {
        throw new RoutingConflictError('Disconnected or cyclic subtree');
      }
      visited.add(ancestor);
      const node = originals.get(ancestor);

      if (!node) {
        throw new RoutingConflictError('Missing subtree ancestor');
      }
      ancestor = node.parentUrlId;
    }
    const path = `${newPrefix}${url.path.slice(oldPrefix.length)}`;

    if (occupied.has(path)) {
      throw new RoutingConflictError('Duplicate relocated paths');
    }
    occupied.add(path);

    return {
      previousUrl: url.toState(),
      newUrl: new Url({
        ...url.toState(),
        urlId: identity.urlId,
        mark: identity.mark,
        parentUrlId: parent.urlId,
        path,
        redirectTargetUrlId: url.redirectTargetUrlId === null ? null
          : mapping.get(url.redirectTargetUrlId)?.urlId ?? url.redirectTargetUrlId,
        firstPublishedAt: replacement.firstPublishedAt,
        createdAt: replacement.createdAt,
        updatedAt: replacement.updatedAt,
      }),
    };
  });
}
