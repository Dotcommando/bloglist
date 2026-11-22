import { type IMediaUsage, MediaUsageTargetKind } from '../../../domain/media/file-library.js';

export function adminMediaUsage(siteId: string, usage: IMediaUsage): {
  readonly group: IMediaUsage['group'];
  readonly title: string;
  readonly field: string;
  readonly state: string;
  readonly editorPath: string;
} {
  const sections: Record<MediaUsageTargetKind, string> = {
    [MediaUsageTargetKind.Page]: 'pages',
    [MediaUsageTargetKind.Template]: 'templates',
    [MediaUsageTargetKind.Chunk]: 'chunks',
    [MediaUsageTargetKind.Snippet]: 'snippets',
    [MediaUsageTargetKind.Site]: 'templates',
    [MediaUsageTargetKind.TemplateVariable]: 'template-variables',
  };

  return {
    group: usage.group,
    title: usage.title,
    field: usage.field,
    editorPath: '/admin/sites/' + siteId + '/' + sections[usage.target.kind]
      + (usage.target.kind === MediaUsageTargetKind.Site
        || usage.target.kind === MediaUsageTargetKind.TemplateVariable ? '' : '/' + usage.target.id),
    state: usage.state,
  };
}
