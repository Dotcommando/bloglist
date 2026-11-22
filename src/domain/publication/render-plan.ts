import type { IJsonLdPagePublication, IJsonLdPublicationContext } from '../json-ld/json-ld-publication.js';
import type { IPageState } from '../pages/page.js';
import type { IDataLoaderBinding, IPageRendering, ITemplateObject, TemplateValue } from '../pages/page-rendering.js';
import type { ISnippetSource } from '../rendering/snippet.js';
import type { IUrlState } from '../routing/url.js';
import type { IPublishedPageSummary } from './published-page-summary.js';

export enum TemplateSourceKind {
  Template = 'Template',
  Chunk = 'Chunk',
  Snippet = 'Snippet',
}

export enum ParameterKind {
  String = 'String',
  Number = 'Number',
  Boolean = 'Boolean',
  Object = 'Object',
  Array = 'Array',
  Enum = 'Enum',
}

export interface IParameterContract {
  readonly name: string;
  readonly kind: ParameterKind;
  readonly required: boolean;
  readonly defaultValue?: TemplateValue;
  readonly properties?: readonly IParameterContract[];
  readonly items?: IParameterContract;
  readonly nullable?: boolean;
  readonly values?: readonly string[];
}

export interface ITemplateSource {
  readonly snippet?: ISnippetSource;
  readonly id: string;
  readonly name?: string;
  readonly revision: string;
  readonly kind: TemplateSourceKind;
  readonly html: string;
  readonly parameters: readonly IParameterContract[];
  readonly frontendSourceId?: string;
}

export interface IFrontendSource {
  readonly id: string;
  readonly revision: string;
  readonly css: string;
  readonly browserTypeScript: string | null;
}

import type { ISiteFavicon } from '../media/site-favicon.js';

export interface IPublicationSnapshot {
  readonly favicon?: ISiteFavicon | null;
  readonly jsonLd?: IJsonLdPublicationContext;
  readonly templateValues?: Readonly<Record<string, ITemplateObject>>;
  readonly publicOrigin?: string;
  readonly publishedPages?: readonly IPublishedPageSummary[];
  readonly siteId: string;
  readonly siteKey: string;
  readonly settings: ITemplateObject;
  readonly requestParameters: readonly IParameterContract[];
  readonly pages: readonly IPageState[];
  readonly urls: readonly IUrlState[];
  readonly templates: readonly ITemplateSource[];
  readonly frontendSources: readonly IFrontendSource[];
}

import type { SnippetExecution } from '../rendering/snippet.js';
import type { ISnippetCachePolicy } from './request-cache.policy.js';

export interface IRenderPlan {
  readonly preparedMarkdown?: { readonly source: string | null; readonly trusted: boolean; readonly html: string };
  readonly snippetCachePolicies?: Readonly<Record<string, ISnippetCachePolicy>>;
  readonly snippetExecutions?: Readonly<Record<string, SnippetExecution>>;
  readonly jsonLd?: IJsonLdPublicationContext;
  readonly templateValues?: ITemplateObject;
  readonly publishedPages?: readonly IPublishedPageSummary[];
  readonly planId: string;
  readonly siteId: string;
  readonly pageId: string;
  readonly settings: ITemplateObject;
  readonly requestParameters: readonly IParameterContract[];
  readonly buildValues: ITemplateObject;
  readonly page: IPageState;
  readonly templates: readonly ITemplateSource[];
  readonly rendering: IPageRendering;
  readonly loaders: readonly IDataLoaderBinding[];
  readonly frontendSourceIds: readonly string[];
}

export interface IRenderedDocument {
  readonly cacheable?: boolean;
  readonly jsonLd?: IJsonLdPagePublication;
  readonly snippetValues?: ITemplateObject;
  readonly mimeType?: string;
  readonly pageId: string;
  readonly html: string;
  readonly frontendSourceIds: readonly string[];
  readonly buildValues?: ITemplateObject;
}

export interface IRenderData {
  readonly pageId: string;
  readonly values: ITemplateObject;
}
