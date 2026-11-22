import { validateJsonLdCatalog } from '../../../domain/json-ld/json-ld-catalog.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { ISaveJsonLdCatalog } from '../../../ports/inbound/json-ld/json-ld-catalog.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type {
  IJsonLdCatalogStore, IJsonLdReferenceOwnership, IJsonLdTemplateCatalog,
} from '../../../ports/outbound/json-ld/json-ld-catalog.port.js';
import { ListJsonLdCatalogUseCase } from './list-json-ld-catalog.use-case.js';

export class SaveJsonLdCatalogUseCase implements ISaveJsonLdCatalog {
  constructor(private readonly sites: IGetSite, private readonly store: IJsonLdCatalogStore,
    private readonly templates: IJsonLdTemplateCatalog, private readonly ownership: IJsonLdReferenceOwnership,
    private readonly nextVersion: () => string) {}

  async execute(input: Parameters<ISaveJsonLdCatalog['execute']>[0]): ReturnType<ISaveJsonLdCatalog['execute']> {
    const previous = await new ListJsonLdCatalogUseCase(this.sites, this.store).execute(input);

    if (previous.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Reload JSON-LD definitions');
    }

    const next = {
      siteId: input.siteId,
      version: this.nextVersion(),
      profiles: structuredClone(input.profiles),
      objects: structuredClone(input.objects),
    };

    validateJsonLdCatalog(next);
    const templates = await this.templates.list(input.siteId);

    if (
      !next.profiles.every((profile) => profile.templateIds.every((id) =>
        templates.some((item) => item.key === id)))
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Unknown JSON-LD template');
    }
    await this.ownership.assertOwned(next, previous);
    await this.store.save(next, previous.version);

    return next;
  }
}
