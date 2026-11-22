import type { IJsonLdCatalog } from '../../../domain/json-ld/json-ld-catalog.js';
import type { IJsonLdGraphResult, JsonLdRoute } from '../../../domain/json-ld/json-ld-graph.js';

export interface IBuildJsonLdPageInput {
  readonly siteId: string;
  readonly pageId: string;
  readonly origin: string;
  readonly templateId: string;
  readonly catalog: IJsonLdCatalog;
  readonly pageFields: Readonly<Record<string, unknown>>;
  readonly templateValues: Readonly<Record<string, unknown>>;
  readonly snippetValues: Readonly<Record<string, unknown>>;
  readonly routes: readonly JsonLdRoute[];
  readonly bindings?: readonly { readonly pageId: string; readonly templateId: string }[];
}

export interface IBuildJsonLdPage {
  execute(input: IBuildJsonLdPageInput): IJsonLdGraphResult | null;
  validateDeferred(input: IBuildJsonLdPageInput): void;
}
