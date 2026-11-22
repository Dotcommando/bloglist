import { RESPONSIVE_IMAGE_PROFILES } from '../../../domain/media/image-profile.js';
import type { IPageState } from '../../../domain/pages/page.js';
import type { ITemplateObject, TemplateValue } from '../../../domain/pages/page-rendering.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import {
  effectiveTemplateValues,
  ImageBindingMode,
  TemplateVariableKind,
  tvObject,
} from '../../../domain/template-variables/template-variable.js';
import type {
  ITemplateVariableMedia,
  ITemplateVariablePublication,
  ITemplateVariableStore,
} from '../../../ports/outbound/template-variables/template-variables.port.js';

/** Shared draft/publication projection of logical TV values into template inputs. */
export class TemplateVariableService implements ITemplateVariablePublication {
  constructor(private readonly definitions: ITemplateVariableStore, private readonly media: ITemplateVariableMedia) {}

  async freeze(page: IPageState): Promise<ITemplateObject> {
    const catalog = await this.definitions.read(page.siteId);

    return effectiveTemplateValues(catalog.fields, page.rendering?.templateId ?? '', page.tvValues ?? {}, true);
  }

  async prepare(siteId: string, values: ITemplateObject): Promise<ITemplateObject> {
    const result: Record<string, TemplateValue> = {};
    const catalog = await this.definitions.read(siteId);
    const hasMedia = Object.values(values).some((value) => tvObject(value)
      && [TemplateVariableKind.Image, TemplateVariableKind.File].some((kind) => kind === value.kind));
    const media = hasMedia ? await this.media.read(siteId) : null;

    if (media?.pending) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Finish the pending file update');
    }

    for (const [name, value] of Object.entries(values)) {
      const field = catalog.fields.find((field) => field.name === name);

      if (value === null && field?.kind === TemplateVariableKind.Image) {
        result[name] = {
          exists: false,
          missing: false,
          src: '',
          srcset: '',
          width: 0,
          height: 0,
          alt: '',
          sources: [],
        };
        continue;
      }
      if (value === null && field?.kind === TemplateVariableKind.File) {
        result[name] = { exists: false, missing: false, url: '', label: '' };
        continue;
      }
      if (!tvObject(value)) {
        result[name] = value;
        continue;
      }
      if (value.kind === TemplateVariableKind.Markdown) {
        result[name] = value.text ?? '';
        continue;
      }

      const file = media?.files.find((file) => file.fileId === value.fileId);
      const selected = value.kind === TemplateVariableKind.Image && value.mode === ImageBindingMode.Single
        ? file?.outputs.find((output) => output.key === value.key)
        : file?.outputs.reduce<(NonNullable<typeof file>['outputs'][number]) | undefined>((largest, output) =>
          (largest?.dimensions?.width ?? -1) >= (output.dimensions?.width ?? 0) ? largest : output, undefined);

      if (value.kind === TemplateVariableKind.File) {
        result[name] = {
          fileId: value.fileId!,
          label: value.label || file?.name || '',
          url: selected?.url ?? '',
          missing: !selected,
          exists: Boolean(selected),
        };
        continue;
      }

      const responsive = value.mode === ImageBindingMode.Responsive;
      const widths = new Map<number, string>();

      if (responsive) {
        file?.outputs.forEach((output) => {
          if (output.dimensions) {
            widths.set(output.dimensions.width, output.url);
          }
        });
      }
      result[name] = {
        fileId: value.fileId!,
        alt: value.alt!,
        src: selected?.url ?? '',
        missing: !selected,
        exists: Boolean(selected),
        width: selected?.dimensions?.width ?? 0,
        height: selected?.dimensions?.height ?? 0,
        mimeType: selected?.mimeType ?? '',
        srcset: [...widths].sort(([a], [b]) => a - b).map(([width, url]) => url + ' ' + width + 'w').join(', '),
        sources: responsive ? RESPONSIVE_IMAGE_PROFILES.flatMap((profile) => {
          const output = file?.outputs.find((output) => output.key === profile.profileId);

          return output ? [{
            srcset: output.url,
            media: '(max-width: ' + profile.targetWidth + 'px)',
            type: output.mimeType,
            width: output.dimensions?.width ?? 0,
            height: output.dimensions?.height ?? 0,
          }] : [];
        }) : [],
      };
    }

    return result;
  }
}
