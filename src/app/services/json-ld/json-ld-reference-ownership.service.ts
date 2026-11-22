import { type IJsonLdCatalog, JsonLdSourceKind } from '../../../domain/json-ld/json-ld-catalog.js';
import { JsonLdReferenceKind, JsonLdValueKind } from '../../../domain/json-ld/json-ld-graph.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetUrlCatalog } from '../../../ports/inbound/routing/get-url-catalog.port.js';
import type { IJsonLdReferenceOwnership } from '../../../ports/outbound/json-ld/json-ld-catalog.port.js';

type Reference = { readonly kind: 'page'; readonly id: string }
  | { readonly kind: 'object'; readonly id: string }
  | { readonly kind: 'exact'; readonly id: string; readonly pageId: string };

function references(catalog: IJsonLdCatalog): Map<string, Reference> {
  const found = new Map<string, Reference>();

  for (const profile of catalog.profiles) {
    for (const node of profile.nodes) {
      for (const mapping of node.mappings) {
        const key = `profile:${profile.profileId}/${node.role}/${mapping.property}`;
        const source = mapping.source;

        if (source.kind === JsonLdSourceKind.SharedObject) {
          found.set(key, { kind: 'object', id: source.objectId });
        } else if (source.kind === JsonLdSourceKind.Page || source.kind === JsonLdSourceKind.PageEntity) {
          found.set(key, { kind: 'page', id: source.pageId });
        } else if (source.kind === JsonLdSourceKind.ExactUrl) {
          found.set(key, { kind: 'exact', id: source.urlId, pageId: source.pageId });
        }
      }
    }
  }

  for (const object of catalog.objects) {
    for (const [name, value] of Object.entries(object.properties)) {
      const key = `object:${object.objectId}/${name}`;

      if (value.kind === JsonLdValueKind.Node) {
        found.set(key, { kind: 'object', id: value.key });
      } else if (value.kind === JsonLdValueKind.Url && value.reference.kind === JsonLdReferenceKind.Page) {
        found.set(key, { kind: 'page', id: value.reference.pageId });
      } else if (value.kind === JsonLdValueKind.Url && value.reference.kind === JsonLdReferenceKind.Exact) {
        found.set(key, { kind: 'exact', id: value.reference.urlId, pageId: value.reference.pageId });
      }
    }
  }

  return found;
}

export class JsonLdReferenceOwnershipService implements IJsonLdReferenceOwnership {
  constructor(private readonly routing: IGetUrlCatalog) {}

  async assertOwned(catalog: IJsonLdCatalog, previous: IJsonLdCatalog): Promise<void> {
    if (catalog.siteId !== previous.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign catalog');
    }

    const next = references(catalog);
    const old = references(previous);
    const routing = await this.routing.execute({ siteId: catalog.siteId });

    if (routing.siteId !== catalog.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign routing');
    }

    for (const [location, reference] of next) {
      let exists: boolean;

      if (reference.kind === 'object') {
        exists = catalog.objects.some((item) => item.objectId === reference.id);
      } else if (reference.kind === 'page') {
        exists = routing.pages.some((item) => item.pageId === reference.id);
      } else {
        const { pageId, id } = reference;
        const seen = new Set<string>();
        let current: string | null = id;
        let target: string | null = null;

        while (current && !seen.has(current)) {
          seen.add(current);
          const url = routing.urls.find((item) => item.url.siteId === catalog.siteId
            && item.url.urlId === current)?.url;

          if (!url) {
            break;
          }
          if (url.kind === UrlKind.PAGE) {
            target = url.pageId;
            break;
          }
          current = url.redirectTargetUrlId;
        }
        exists = target === pageId && routing.pages.some((item) => item.pageId === pageId);
      }
      if (!exists && JSON.stringify(old.get(location)) !== JSON.stringify(reference)) {
        throw new BusinessError(BusinessErrorCode.NotFound, `Missing or foreign JSON-LD reference: ${location}`);
      }
    }
  }
}
