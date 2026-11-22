import type { ITemplateObject, LoaderPhase, TemplateValue } from '../../../domain/pages/page-rendering.js';
import type { IPublishedPageSummary } from '../../../domain/publication/published-page-summary.js';
import type { IParameterContract } from '../../../domain/publication/render-plan.js';
import type { ITemplateSource } from '../../../domain/publication/render-plan.js';
import type { ISnippetCachePolicy } from '../../../domain/publication/request-cache.policy.js';
import type { SnippetExecution } from '../../../domain/rendering/snippet.js';
import type { CmsApi } from '../../inbound/cms/cms-api.port.js';

export interface ILoaderContext {
  readonly background?: boolean;
  readonly cachePolicy?: ISnippetCachePolicy | undefined;
  readonly onUncacheable?: () => void;
  readonly execution?: SnippetExecution;
  readonly cms?: CmsApi;
  readonly siteId: string;
  readonly pageId: string;
  readonly language: string;
  readonly phase: LoaderPhase;
  readonly preview: boolean;
  readonly signal: AbortSignal;
  readonly publishedPages?: readonly IPublishedPageSummary[];
  readonly snippetSources?: readonly ITemplateSource[];
}

export interface ISnippet {
  readonly cache?: ISnippetCachePolicy | undefined;
  readonly execution?: SnippetExecution;
  readonly id: string;
  readonly parameters: readonly IParameterContract[];
  readonly output: IParameterContract;
  readonly phases: readonly LoaderPhase[];
  readonly fallback?: TemplateValue;
  read(input: ITemplateObject, context: ILoaderContext): Promise<TemplateValue>;
}

/** Compatibility name for existing integrations and persisted loader bindings. */
export type IDataLoader = ISnippet;
