import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { effectiveTemplateValues } from '../../../domain/template-variables/template-variable.js';
import type { IGetPage } from '../../../ports/inbound/pages/get-page.port.js';
import type {
  IGetPageTemplateVariables,
  IListTemplateVariables,
} from '../../../ports/inbound/template-variables/template-variables.port.js';
import type {
  ITemplateVariableMedia,
  ITemplateVariablePublication,
} from '../../../ports/outbound/template-variables/template-variables.port.js';

export class GetPageTemplateVariablesUseCase implements IGetPageTemplateVariables {
  constructor(private readonly definitions: IListTemplateVariables, private readonly pages: IGetPage,
    private readonly media: ITemplateVariableMedia, private readonly projection: ITemplateVariablePublication) {}

  async execute(input: Parameters<IGetPageTemplateVariables['execute']>[0]):
  ReturnType<IGetPageTemplateVariables['execute']> {
    const catalog = await this.definitions.execute(input);
    const page = await this.pages.execute(input);

    if (page?.siteId !== input.siteId || page.pageId !== input.pageId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Page not found');
    }

    const state = page.toState();
    const media = await this.media.read(input.siteId);

    return {
      catalog,
      values: state.tvValues ?? {},
      templateId: state.rendering?.templateId ?? null,
      updatedAt: state.updatedAt,
      mediaVersion: media.version,
      prepared: await this.projection.prepare(input.siteId, effectiveTemplateValues(catalog.fields,
        state.rendering?.templateId ?? '', state.tvValues ?? {})),
    };
  }
}
