import { MediaUsageGroup, MediaUsageTargetKind } from '../../../../domain/media/file-library.js';
import type {
  IMediaReferenceSource,
  IMediaReferenceSources,
} from '../../../../ports/outbound/media/file-library.port.js';
import type { IRenderingSourcePort } from '../../../../ports/outbound/publication/rendering-source.port.js';
import { mediaReferenceText } from '../../media/references/media-usages.adapter.js';

export class RenderingMediaReferencesAdapter implements IMediaReferenceSources {
  constructor(private readonly sources: IRenderingSourcePort) {}

  async read(siteId: string): Promise<readonly IMediaReferenceSource[]> {
    const sources = await this.sources.read(siteId);
    const result = sources.templates.flatMap((source) => {
      const kind = source.kind === 'Template' ? MediaUsageTargetKind.Template
        : source.kind === 'Chunk' ? MediaUsageTargetKind.Chunk : MediaUsageTargetKind.Snippet;
      const base = {
        group: MediaUsageGroup.Templates,
        title: source.name ?? source.id,
        state: 'Draft',
        target: { kind, id: source.id },
      };
      const frontend = sources.frontendSources.find((item) => item.id === source.frontendSourceId);

      return [{ ...base, field: 'html', text: source.html },
        { ...base, field: 'css', text: frontend?.css ?? '' },
        { ...base, field: 'browserTypeScript', text: frontend?.browserTypeScript ?? '' },
        { ...base, field: 'parameters', text: mediaReferenceText(source.parameters) },
        { ...base, field: 'snippet', text: source.snippet?.code ?? '' }];
    });
    const assigned = new Set(sources.templates.map((source) => source.frontendSourceId));

    for (const source of sources.frontendSources.filter((source) => !assigned.has(source.id))) {
      const base = {
        group: MediaUsageGroup.Templates,
        title: source.id,
        state: 'Site configuration',
        target: { kind: MediaUsageTargetKind.Site, id: siteId },
      };

      result.push({ ...base, field: source.id + '/styles.css', text: source.css },
        { ...base, field: source.id + '/client.ts', text: source.browserTypeScript ?? '' });
    }

    result.push({
      group: MediaUsageGroup.Templates,
      title: sources.siteKey,
      state: 'Site configuration',
      target: { kind: MediaUsageTargetKind.Site, id: siteId },
      field: 'settings',
      text: mediaReferenceText(sources.settings),
    });

    return result;
  }
}
