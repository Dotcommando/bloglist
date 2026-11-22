import { Page } from '../../../domain/pages/page.js';
import { BrowserInteraction, HtmlDelivery } from '../../../domain/pages/page-rendering.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import {
  TemplateVariableKind,
  tvObject,
  tvRequirement,
  validateFieldValue,
  validateTemplateValues,
} from '../../../domain/template-variables/template-variable.js';
import type { IGetPage } from '../../../ports/inbound/pages/get-page.port.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { ISavePageTemplateVariables } from '../../../ports/inbound/template-variables/template-variables.port.js';
import type {
  IPageTemplateVariableStore,
  ITemplateVariableMedia,
  ITemplateVariableStore,
  ITemplateVariableTemplates,
} from '../../../ports/outbound/template-variables/template-variables.port.js';
import { ListTemplateVariablesUseCase } from './list-template-variables.use-case.js';

export class SavePageTemplateVariablesUseCase implements ISavePageTemplateVariables {
  constructor(private readonly sites: IGetSite, private readonly pages: IGetPage,
    private readonly definitions: ITemplateVariableStore, private readonly templates: ITemplateVariableTemplates,
    private readonly media: ITemplateVariableMedia, private readonly store: IPageTemplateVariableStore) {}

  async execute(input: Parameters<ISavePageTemplateVariables['execute']>[0]):
  ReturnType<ISavePageTemplateVariables['execute']> {
    const catalog = await new ListTemplateVariablesUseCase(this.sites, this.definitions).execute(input);
    const page = await this.pages.execute(input);

    if (page?.siteId !== input.siteId || page.pageId !== input.pageId) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Page not found');
    }

    const previous = page.toState();

    if (
      catalog.version !== input.catalogVersion
      || previous.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Reload page TV values');
    }
    validateTemplateValues(input.values);
    tvRequirement((await this.templates.list(input.siteId)).some((template) => template.key === input.templateId),
      'Unknown page template');
    const media = await this.media.read(input.siteId);
    const values = { ...previous.tvValues, ...input.values };
    let usesMedia = false;

    for (const [name, value] of Object.entries(input.values)) {
      const old = previous.tvValues?.[name];
      const same = JSON.stringify(old) === JSON.stringify(value);
      const field = catalog.fields.find((field) => field.name === name);

      tvRequirement(field !== undefined || same, 'Unknown TV: ' + name);

      if (field && !same) {
        validateFieldValue(field, value);
      }
      if (tvObject(value) && value.kind !== TemplateVariableKind.Markdown) {
        usesMedia = true;
        const file = media.files.find((file) => file.fileId === value.fileId);
        const sameReference = tvObject(old) && old.fileId === value.fileId && old.kind === value.kind;

        if (!file && !sameReference) {
          throw new BusinessError(BusinessErrorCode.NotFound, 'TV file is missing or belongs to another site');
        }
        tvRequirement(!file || value.kind !== TemplateVariableKind.Image || file.mimeType.startsWith('image/'),
          'Image TV requires an image');
      }
    }

    if (usesMedia && (media.pending || media.version !== input.mediaVersion)) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Reload files before saving TV values');
    }

    // Missing keys explicitly request the current default. Keep unassigned values.
    for (const field of catalog.fields.filter((field) => field.templateIds.includes(input.templateId))) {
      if (!Object.hasOwn(input.values, field.name)) {
        delete values[field.name];
      }
    }
    const next = new Page({ ...previous, tvValues: values });

    next.configureRendering({
      ...(previous.rendering ?? { delivery: HtmlDelivery.Static, interaction: BrowserInteraction.None, loaders: [] }),
      templateId: input.templateId,
      parameters: previous.rendering?.templateId === input.templateId ? previous.rendering.parameters : {},
    });
    next.editDraft();

    return this.store.save(previous, next.toState(), catalog.version, usesMedia ? media.version : null);
  }
}
