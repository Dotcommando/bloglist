import type { IJsonLdCatalog, IJsonLdProfile, IJsonLdSharedObject } from '../../../domain/json-ld/json-ld-catalog.js';

export interface IListJsonLdCatalog {
  execute(input: { readonly siteId: string }): Promise<IJsonLdCatalog>;
}

export interface ISaveJsonLdCatalog {
  execute(input: { readonly siteId: string;
    readonly expectedVersion: string;
    readonly profiles: readonly IJsonLdProfile[];
    readonly objects: readonly IJsonLdSharedObject[] }): Promise<IJsonLdCatalog>;
}
