import type { ITemplateObject, TemplateValue } from '../../../domain/pages/page-rendering.js';
import type { ILoaderContext } from './data-loader.port.js';

export interface ILoaderExecutionPort {
  validate(loaderId: string, phase: ILoaderContext['phase'], required: boolean): void;
  execute(loaderId: string, input: ITemplateObject, context: ILoaderContext, required: boolean): Promise<TemplateValue>;
}
