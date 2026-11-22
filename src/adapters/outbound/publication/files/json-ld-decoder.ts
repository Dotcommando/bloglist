import { validateJsonLdCatalog } from '../../../../domain/json-ld/json-ld-catalog.js';
import { type JsonLdRoute, JsonLdRouteKind } from '../../../../domain/json-ld/json-ld-graph.js';
import type { IJsonLdPageValues, IJsonLdPublicationContext } from '../../../../domain/json-ld/json-ld-publication.js';
import { PublicationConsistencyError } from '../../../../domain/publication/published-document.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PublicationConsistencyError('Invalid JSON-LD publication object');
  }

  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length) {
    throw new PublicationConsistencyError('Invalid JSON-LD publication text');
  }

  return value;
}

export function decodeJsonLdContext(value: unknown, siteId: string): IJsonLdPublicationContext {
  const raw = object(value);
  const catalog = raw.catalog;

  validateJsonLdCatalog(catalog);

  if (catalog.siteId !== siteId || !Array.isArray(raw.routes)) {
    throw new PublicationConsistencyError('Foreign or corrupt JSON-LD publication context');
  }

  const origin = text(raw.origin);
  const url = new URL(origin);

  if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
    throw new PublicationConsistencyError('Invalid JSON-LD publication origin');
  }

  const routes = raw.routes.map((value: unknown): JsonLdRoute => {
    const route = object(value);
    const kind = route.kind;

    if (kind !== JsonLdRouteKind.Page && kind !== JsonLdRouteKind.Redirect) {
      throw new PublicationConsistencyError('Invalid JSON-LD publication route');
    }

    const path = text(route.path);

    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path)) {
      throw new PublicationConsistencyError('Invalid JSON-LD publication path');
    }

    return { kind, pageId: text(route.pageId), urlId: text(route.urlId), path };
  });

  if (raw.bindings !== undefined && !Array.isArray(raw.bindings)) {
    throw new PublicationConsistencyError('Invalid JSON-LD published bindings');
  }

  const bindings = raw.bindings === undefined ? undefined : raw.bindings.map((value: unknown) => {
    const binding = object(value);

    return { pageId: text(binding.pageId), templateId: text(binding.templateId) };
  });

  return { catalog, origin, routes, ...(bindings ? { bindings } : {}) };
}

export function decodeJsonLdPageValues(value: unknown, siteId: string): IJsonLdPageValues {
  const raw = object(value);

  if (raw.siteId !== siteId) {
    throw new PublicationConsistencyError('Foreign JSON-LD page');
  }

  return {
    ...decodeJsonLdContext(raw, siteId),
    siteId,
    pageId: text(raw.pageId),
    templateId: text(raw.templateId),
    pageFields: object(raw.pageFields),
    templateValues: object(raw.templateValues),
    snippetValues: object(raw.snippetValues),
  };
}
