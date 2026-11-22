import type { IJsonLdCatalog } from './json-ld-catalog.js';
import type { IJsonLdGraphResult, JsonLdRoute } from './json-ld-graph.js';

export interface IJsonLdPublicationContext {
  readonly catalog: IJsonLdCatalog;
  readonly origin: string;
  readonly routes: readonly JsonLdRoute[];
  readonly bindings?: readonly { readonly pageId: string; readonly templateId: string }[];
}

export interface IJsonLdPageValues extends IJsonLdPublicationContext {
  readonly siteId: string;
  readonly pageId: string;
  readonly templateId: string;
  readonly pageFields: Readonly<Record<string, unknown>>;
  readonly templateValues: Readonly<Record<string, unknown>>;
  readonly snippetValues: Readonly<Record<string, unknown>>;
}

export interface IJsonLdPagePublication {
  readonly input: IJsonLdPageValues;
  readonly result: IJsonLdGraphResult | null;
}
