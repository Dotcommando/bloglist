import type { IContentAccess } from '../../../domain/authorization/content-access.js';
import type { TemplateSourceKind } from '../../../domain/publication/render-plan.js';
import type { IElementIdentity, IRenderingElementState } from '../../../domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IElementCatalog, IElementFallback } from '../../../ports/outbound/rendering/element-sources.port.js';
import type { IElementStore } from '../../../ports/outbound/rendering/element-store.port.js';

export class RenderingCatalogService implements IElementCatalog {
  constructor(private readonly store: IElementStore, private readonly fallback: IElementFallback) {}

  async find(identity: IElementIdentity, access?: IContentAccess): Promise<IRenderingElementState | null> {
    const stored = await this.store.find(identity, access);

    if (stored) {
      if (stored.siteId !== identity.siteId || stored.kind !== identity.kind || stored.key !== identity.key) {
        throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign element');
      }

      return stored;
    }
    if (access && !access.scopes.includes('all')) {
      return null;
    }

    return (await this.list(identity.siteId, identity.kind)).find((item) => item.key === identity.key) ?? null;
  }

  async list(siteId: string, kind?: TemplateSourceKind, access?: IContentAccess):
  Promise<readonly IRenderingElementState[]> {
    if (access && !access.scopes.includes('all')) {
      return this.store.list(siteId, kind, access);
    }

    const stored = await this.store.list(siteId);

    if (stored.some((item) => item.siteId !== siteId)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign elements');
    }

    const fallback = await this.fallback.list(siteId, stored);

    if (fallback.some((item) => item.siteId !== siteId)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign fallback');
    }

    const items = new Map([...fallback, ...stored].map((item) => [item.kind + ':' + item.key, item]));

    return [...items.values()].filter((item) => !kind || item.kind === kind)
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }
}
