import { RoutingConflictError } from '../../../domain/routing/routing-conflict.error.js';
import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { Url } from '../../../domain/routing/url.js';
import type { IVersionedUrl } from '../../../domain/routing/versioned-url.js';
import { requireInstant, requireText } from '../../../domain/shared/validation.js';
import type {
  IUrlBehaviorChange, IUrlBehaviorStorePort,
} from '../../../ports/outbound/routing/url-behavior-store.port.js';
import type { IUrlBehaviorValuesPort } from '../../../ports/outbound/routing/url-behavior-values.port.js';

export async function loadBehavior(store: IUrlBehaviorStorePort, siteId: string, urlId: string,
  expectedVersion: string): Promise<IVersionedUrl> {
  requireText(siteId, 'siteId');
  requireText(urlId, 'urlId');
  requireText(expectedVersion, 'expectedVersion');
  const found = await store.findVersionedUrl(siteId, urlId);

  if (!found) {
    throw new RoutingNotFoundError('URL not found');
  }
  if (found.url.siteId !== siteId || found.url.urlId !== urlId) {
    throw new RoutingScopeError('Foreign URL');
  }
  if (found.version !== expectedVersion) {
    throw new RoutingConflictError('URL version changed');
  }

  return { url: new Url(found.url).toState(), version: found.version };
}

export function prepareBehavior(current: IVersionedUrl, next: Url, values: IUrlBehaviorValuesPort): IUrlBehaviorChange {
  const at = values.currentInstant();
  const historyId = values.nextHistoryId();
  const nextVersion = values.nextVersion();

  requireInstant(at, 'changedAt');
  requireText(historyId, 'historyId');
  requireText(nextVersion, 'nextVersion');

  if (nextVersion === current.version) {
    throw new RoutingConflictError('Version must change');
  }

  return {
    siteId: current.url.siteId,
    previous: current.url,
    expectedVersion: current.version,
    next: new Url({ ...next.toState(), updatedAt: at }).toState(),
    nextVersion,
    history: {
      urlHistoryEntryId: historyId,
      urlId: current.url.urlId,
      kind: current.url.kind,
      pageId: current.url.pageId,
      redirectTargetUrlId: current.url.redirectTargetUrlId,
      redirectStatus: current.url.redirectStatus,
      createdAt: at,
    },
  };
}
