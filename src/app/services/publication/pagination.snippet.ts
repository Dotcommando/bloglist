import type { ITemplateObject } from '../../../domain/pages/page-rendering.js';
import { LoaderPhase } from '../../../domain/pages/page-rendering.js';
import {
  type IPaginationResult, paginate, paginationOutput, paginationParameters,
} from '../../../domain/rendering/pagination-snippet.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { ILoaderContext, ISnippet } from '../../../ports/outbound/publication/data-loader.port.js';

export class PaginationSnippet implements ISnippet {
  readonly id = 'Pagination';
  readonly phases = [LoaderPhase.Build, LoaderPhase.Request];
  readonly parameters = paginationParameters;
  readonly output = paginationOutput;

  async read(input: ITemplateObject, context: ILoaderContext): Promise<IPaginationResult> {
    context.signal.throwIfAborted();

    try {
      return paginate(input, context);
    } catch {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid Pagination input');
    }
  }
}
