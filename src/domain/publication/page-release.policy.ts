import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import type { IPublicationManifest } from './publication-release.js';
import { PublishedRouteKind } from './published-route.js';

export function mergePageRoutes(previous: IPublicationManifest | null, next: IPublicationManifest,
  pageId: string): IPublicationManifest['routes'] {
  const replacements = new Set(next.routes.map((route) => route.urlId));
  const retained = previous?.routes.filter((route) => !replacements.has(route.urlId)
    && (route.kind === PublishedRouteKind.Redirect || route.pageId !== pageId)) ?? [];
  const routes = [...retained, ...next.routes];

  if (new Set(routes.map((route) => route.path)).size !== routes.length) {
    throw new BusinessError(BusinessErrorCode.Conflict, 'A different published page uses this path');
  }

  return routes;
}
