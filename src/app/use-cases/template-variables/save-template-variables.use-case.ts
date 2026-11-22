import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { TemplateVariableKind, tvObject, tvRequirement, validateTemplateVariables }
  from '../../../domain/template-variables/template-variable.js';
import type { IGetSite } from '../../../ports/inbound/sites/get-site.port.js';
import type { ISaveTemplateVariables } from '../../../ports/inbound/template-variables/template-variables.port.js';
import type {
  ITemplateVariableMedia,
  ITemplateVariableStore,
  ITemplateVariableTemplates,
} from '../../../ports/outbound/template-variables/template-variables.port.js';
import { ListTemplateVariablesUseCase } from './list-template-variables.use-case.js';

export class SaveTemplateVariablesUseCase implements ISaveTemplateVariables {
  constructor(private readonly sites: IGetSite, private readonly store: ITemplateVariableStore,
    private readonly templates: ITemplateVariableTemplates, private readonly nextVersion: () => string,
    private readonly media: ITemplateVariableMedia) {}

  async execute(input: Parameters<ISaveTemplateVariables['execute']>[0]):
  ReturnType<ISaveTemplateVariables['execute']> {
    const previous = await new ListTemplateVariablesUseCase(this.sites, this.store).execute(input);

    if (previous.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Reload TV definitions');
    }
    validateTemplateVariables(input.fields);
    const templates = await this.templates.list(input.siteId);

    tvRequirement(input.fields.every((field) => field.templateIds.every((key) =>
      templates.some((template) => template.key === key))), 'Unknown TV template');
    const references = input.fields.filter((field) => tvObject(field.defaultValue)
      && field.defaultValue.kind !== TemplateVariableKind.Markdown);

    if (references.length) {
      const media = await this.media.read(input.siteId);

      if (media.pending) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Finish the pending file update');
      }

      for (const field of references) {
        const value = field.defaultValue;
        const old = previous.fields.find((item) => item.name === field.name)?.defaultValue;

        if (!tvObject(value)) {
          continue;
        }

        const file = media.files.find((file) => file.fileId === value.fileId);
        const sameReference = tvObject(old) && old.fileId === value.fileId && old.kind === value.kind;

        if (!file && !sameReference) {
          throw new BusinessError(BusinessErrorCode.NotFound, 'TV default file is missing or foreign');
        }
        tvRequirement(!file || field.kind !== TemplateVariableKind.Image || file.mimeType.startsWith('image/'),
          'Image TV default requires an image');
      }
    }

    const next = { siteId: input.siteId, version: this.nextVersion(), fields: structuredClone(input.fields) };

    await this.store.save(next, previous.version);

    return next;
  }
}
