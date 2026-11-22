import { type JsonLdRoute, JsonLdRouteKind } from './json-ld-graph.js';

export interface IJsonLdRoutingEntry {
  readonly urlId: string;
  readonly path: string;
  readonly pageId: string | null;
  readonly targetUrlId: string | null;
}

export function jsonLdRoutes(entries: readonly IJsonLdRoutingEntry[]): readonly JsonLdRoute[] {
  return entries.flatMap((entry): JsonLdRoute[] => {
    const visited = new Set<string>();
    let target: IJsonLdRoutingEntry | undefined = entry;

    while (target && !target.pageId && target.targetUrlId && !visited.has(target.urlId)) {
      visited.add(target.urlId);
      const nextId: string = target.targetUrlId;

      target = entries.find((candidate) => candidate.urlId === nextId);
    }

    if (!target?.pageId) {
      return [];
    }

    return [{
      kind: entry.pageId ? JsonLdRouteKind.Page : JsonLdRouteKind.Redirect,
      urlId: entry.urlId,
      path: entry.path,
      pageId: target.pageId,
    }];
  });
}
