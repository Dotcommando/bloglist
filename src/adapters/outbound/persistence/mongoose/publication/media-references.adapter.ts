import type { Model } from 'mongoose';
import { parse, serialize } from 'parse5';

import { MediaUsageGroup, MediaUsageTargetKind } from '../../../../../domain/media/file-library.js';
import { ReleaseState } from '../../../../../domain/publication/publication-release.js';
import type {
  IMediaReferenceSource,
  IMediaReferenceSources,
} from '../../../../../ports/outbound/media/file-library.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../../../../ports/outbound/publication/publication-artifact-source.port.js';
import { mediaReferenceText } from '../../../media/references/media-usages.adapter.js';
import { decodePlan } from '../../../publication/files/plan-decoder.js';
import { walkHtml } from '../../../rendering/modx/html-safety.js';
import type { IReleaseRecord } from './publication.models.js';

export class PublicationMediaReferencesAdapter implements IMediaReferenceSources {
  constructor(private readonly releases: Model<IReleaseRecord>,
    private readonly artifacts: IPublicationArtifactSourcePort) {}

  async read(siteId: string): Promise<readonly IMediaReferenceSource[]> {
    const releases = await this.releases.find({ siteId, state: ReleaseState.Ready }).lean().exec();
    const result: IMediaReferenceSource[] = [];

    for (const release of releases) {
      if (release.siteId !== siteId) {
        throw new Error('Foreign media publication reference');
      }

      for (const artifact of await this.artifacts.readArtifacts(siteId, release._id)) {
        if (
          !['text/html', 'text/css', 'text/javascript', 'application/javascript', 'application/json']
            .includes(artifact.mimeType)
        ) {
          continue;
        }

        const route = release.manifest?.routes.find((route) =>
          'documentPath' in route && route.documentPath === artifact.path);
        const pageId = route && 'pageId' in route ? route.pageId : null;
        const base = {
          title: pageId
            ? release.manifest?.publishedPages?.find((page) => page.pageId === pageId)?.title ?? pageId : artifact.path,
          target: pageId ? { kind: MediaUsageTargetKind.Page, id: pageId }
            : { kind: MediaUsageTargetKind.Site, id: siteId },
          state: 'Release ' + release._id,
        };
        const chunks: Uint8Array[] = [];

        for await (const chunk of artifact.content.bytes) {
          chunks.push(chunk);
        }
        let text = Buffer.concat(chunks).toString('utf8');

        if (artifact.mimeType === 'application/json' && artifact.path.startsWith('plans/')) {
          const { plan, assets } = decodePlan(JSON.parse(text));

          if (plan.siteId !== siteId || plan.page.siteId !== siteId) {
            throw new Error('Foreign Request plan');
          }

          const page = {
            ...base,
            title: plan.page.title,
            target: { kind: MediaUsageTargetKind.Page, id: plan.pageId },
          };

          result.push({ ...page, group: MediaUsageGroup.OpenGraph, field: 'ogImage', text: plan.page.ogImage ?? '' },
            { ...page, group: MediaUsageGroup.Content, field: 'contentMd', text: plan.page.contentMd },
            {
              ...page,
              group: MediaUsageGroup.Content,
              field: 'Request values',
              text: mediaReferenceText([plan.rendering, plan.buildValues]),
            });

          for (const source of plan.templates) {
            const kind = source.kind === 'Template' ? MediaUsageTargetKind.Template
              : source.kind === 'Chunk' ? MediaUsageTargetKind.Chunk : MediaUsageTargetKind.Snippet;

            result.push({
              ...base,
              group: MediaUsageGroup.Templates,
              title: source.name ?? source.id,
              target: { kind, id: source.id },
              field: 'Request template',
              text: mediaReferenceText(source),
            });
          }
          result.push({
            ...base,
            group: MediaUsageGroup.Templates,
            field: 'Request settings/assets',
            text: mediaReferenceText([plan.settings, assets]),
          });

          continue;
        }
        if (artifact.mimeType === 'application/json') {
          text = mediaReferenceText(JSON.parse(text));
        }
        if (artifact.mimeType === 'text/html') {
          const tree = parse(text);

          walkHtml(tree, (node) => {
            if (
              'tagName' in node
              && node.tagName === 'meta'
              && node.attrs.some((attr) => attr.name === 'property' && attr.value === 'og:image')
            ) {
              const content = node.attrs.find((attr) => attr.name === 'content');

              if (content) {
                result.push({
                  ...base,
                  group: MediaUsageGroup.OpenGraph,
                  field: 'og:image · ' + artifact.path,
                  text: content.value,
                });
                content.value = '';
              }
            }
          });
          text = serialize(tree);
        }
        result.push({
          ...base,
          group: artifact.mimeType === 'text/html' ? MediaUsageGroup.Content : MediaUsageGroup.Templates,
          field: artifact.path,
          text,
        });
      }
    }

    return result;
  }
}
