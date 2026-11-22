import type { IJsonLdCatalog } from '../../../domain/json-ld/json-ld-catalog.js';

export interface IJsonLdCatalogReader {
  read(siteId: string): Promise<IJsonLdCatalog>;
}

export interface IJsonLdCatalogStore extends IJsonLdCatalogReader {
  save(catalog: IJsonLdCatalog, expectedVersion: string): Promise<void>;
}

export interface IJsonLdTemplateCatalog {
  list(siteId: string): Promise<readonly { readonly key: string }[]>;
}

export interface IJsonLdReferenceOwnership {
  assertOwned(catalog: IJsonLdCatalog, previous: IJsonLdCatalog): Promise<void>;
}
