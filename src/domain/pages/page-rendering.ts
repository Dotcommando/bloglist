export enum HtmlDelivery {
  Static = 'Static',
  Request = 'Request',
}

export enum BrowserInteraction {
  None = 'None',
  Api = 'Api',
}

export enum LoaderPhase {
  Build = 'Build',
  Request = 'Request',
}

export interface ITemplateObject {
  readonly [key: string]: TemplateValue;
}

export type TemplateValue = string | number | boolean | null | readonly TemplateValue[] | ITemplateObject;

export interface IDataLoaderBinding {
  readonly loaderId: string;
  readonly alias: string;
  readonly phase: LoaderPhase;
  readonly parameters: ITemplateObject;
  readonly dependsOn: readonly string[];
  readonly required: boolean;
}

import type { IRequestCachePolicy } from '../publication/request-cache.policy.js';

export interface IPageRendering {
  readonly requestCache?: IRequestCachePolicy;
  readonly templateId: string;
  readonly delivery: HtmlDelivery;
  readonly interaction: BrowserInteraction;
  readonly parameters: ITemplateObject;
  readonly loaders: readonly IDataLoaderBinding[];
}
