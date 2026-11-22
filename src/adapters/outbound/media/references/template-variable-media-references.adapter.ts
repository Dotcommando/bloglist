import { MediaUsageGroup, MediaUsageTargetKind } from '../../../../domain/media/file-library.js';
import type {
  IMediaReferenceSource, IMediaReferenceSources,
} from '../../../../ports/outbound/media/file-library.port.js';
import type { ITemplateVariableStore } from '../../../../ports/outbound/template-variables/template-variables.port.js';
import { mediaReferenceFileIds, mediaReferenceText } from './media-usages.adapter.js';

export class TemplateVariableMediaReferencesAdapter implements IMediaReferenceSources {
  constructor(private readonly variables: Pick<ITemplateVariableStore, 'read'>) {}

  async read(siteId: string): Promise<readonly IMediaReferenceSource[]> {
    const catalog = await this.variables.read(siteId);

    if (catalog.siteId !== siteId) {
      throw new Error('Foreign TV catalog');
    }

    return catalog.fields.map((field) => ({
      group: MediaUsageGroup.Templates,
      title: field.caption,
      target: { kind: MediaUsageTargetKind.TemplateVariable, id: field.name },
      field: 'defaultValue',
      state: 'Draft',
      text: mediaReferenceText(field.defaultValue),
      fileIds: mediaReferenceFileIds(field.defaultValue),
    }));
  }
}
