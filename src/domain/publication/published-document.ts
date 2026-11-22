import type { IRenderPlan } from './render-plan.js';

export interface IPreparedInlineStyle {
  readonly content: string;
  readonly hash: string;
}

export interface ICompiledPageAssets {
  readonly inlineStyles?: readonly IPreparedInlineStyle[];
  readonly head: string;
  readonly body: string;
}

export interface IStoredRequestPlan {
  /** Derived only after verified admission; absent for legacy port implementations. */
  readonly contentFingerprint?: string;
  readonly siteId: string;
  readonly releaseId: string;
  readonly plan: IRenderPlan;
  readonly assets: ICompiledPageAssets;
}

export interface IHtmlOutput {
  readonly html: string;
  readonly inlineStyleHashes: readonly string[];
}

export enum DocumentRepresentation {
  Html = 'html',
  Markdown = 'markdown',
}

export enum RequestCacheStatus { Hit = 'hit', Miss = 'miss', Coalesced = 'coalesced', Bypass = 'bypass' }

export interface IPublishedDocument extends IHtmlOutput {
  readonly cacheStatus?: RequestCacheStatus;
  readonly cacheable?: boolean;
  readonly markdown?: string;
  readonly releaseId: string;
  readonly pageId: string;
}

export class PublicationConsistencyError extends Error {}

export class PublishedDataUnavailableError extends Error {}
