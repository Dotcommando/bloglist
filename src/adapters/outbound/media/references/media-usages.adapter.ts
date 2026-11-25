import type { IMediaUsage } from '../../../../domain/media/file-library.js';
import type { IMediaReferenceSources, IMediaUsages } from '../../../../ports/outbound/media/file-library.port.js';

function decoded(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

export function mediaReferenceText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(mediaReferenceText).join('\n');
  }
  if (value && typeof value === 'object') {
    return Object.values(value).map(mediaReferenceText).join('\n');
  }

  return '';
}

export function mediaReferenceFileIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(mediaReferenceFileIds);
  }
  if (value && typeof value === 'object') {
    if (
      'kind' in value
      && (value.kind === 'Image'
      || value.kind === 'File')
      && 'fileId' in value
      && typeof value.fileId === 'string'
    ) {
      return value.fileId ? [value.fileId] : [];
    }

    return Object.values(value).flatMap(mediaReferenceFileIds);
  }

  return [];
}

export class MediaUsagesAdapter implements IMediaUsages {
  constructor(private readonly sources: readonly IMediaReferenceSources[],
    private readonly addonReferences?: { find(siteId: string, fileId: string): Promise<readonly IMediaUsage[]> }) {}

  async find(siteId: string, paths: readonly string[], fileId?: string): Promise<readonly IMediaUsage[]> {
    const patterns = [...new Set(paths.map(decoded))].map((path) =>
      new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + String.raw`(?=[?#\s"'<>),;]|$)`, 'u'));
    const result = new Map<string, IMediaUsage>();

    for (const source of this.sources) {
      for (const item of await source.read(siteId)) {
        if (fileId && item.fileIds?.includes(fileId) || patterns.some((pattern) => pattern.test(decoded(item.text)))) {
          const usage = {
            group: item.group,
            title: item.title,
            field: item.field,
            target: item.target,
            state: item.state,
          };

          result.set(JSON.stringify(usage), usage);
        }
      }
    }

    const addons = fileId ? await this.addonReferences?.find(siteId, fileId) ?? [] : [];

    return [...result.values(), ...addons];
  }
}
