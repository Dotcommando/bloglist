import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import type { IFrontendSource, IParameterContract, ITemplateSource } from '../../../domain/publication/render-plan.js';

export interface IRenderingSources {
  readonly siteKey: string;
  readonly settings: ITemplateObject;
  readonly requestParameters: readonly IParameterContract[];
  readonly templates: readonly ITemplateSource[];
  readonly frontendSources: readonly IFrontendSource[];
}

export interface IRenderingSourcePort {
  read(siteId: string): Promise<IRenderingSources>;
}
