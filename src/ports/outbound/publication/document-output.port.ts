import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import type { ICompiledPageAssets, IHtmlOutput } from '../../../domain/publication/published-document.js';
import type { IParameterContract } from '../../../domain/publication/render-plan.js';

export interface IDocumentOutputPort {
  /** Selects declared rendering inputs and validates them strictly; all undeclared values are ignored. */
  normalizeRequest(schema: readonly IParameterContract[], input: ITemplateObject): ITemplateObject;
  complete(html: string, assets: ICompiledPageAssets): Promise<IHtmlOutput>;
  inlineStyleHashes(html: string): readonly string[];
}
