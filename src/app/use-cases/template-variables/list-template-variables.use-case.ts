import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { IListTemplateVariables } from '../../../ports/inbound/template-variables/template-variables.port.js';
import type { ITemplateVariableStore } from '../../../ports/outbound/template-variables/template-variables.port.js';

export class ListTemplateVariablesUseCase implements IListTemplateVariables {
  constructor(private readonly sites: IGetSite, private readonly store: ITemplateVariableStore) {}

  async execute(input: Parameters<IListTemplateVariables['execute']>[0]):
  ReturnType<IListTemplateVariables['execute']> {
    if ((await this.sites.execute(input))?.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }

    const catalog = await this.store.read(input.siteId);

    if (catalog.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Foreign TV catalog');
    }

    return catalog;
  }
}
