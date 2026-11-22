import { ReleaseState } from '../../../../domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { ICmsPublishedPagesPort } from '../../../../ports/outbound/cms/published-pages.port.js';
import type { IPagePublicationPort } from '../../../../ports/outbound/pages/page-publication.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationStorePort } from '../../../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../../../ports/outbound/publication/release-activation.port.js';
import { decodePageSnapshot, pageSnapshotPath, pageVersionId } from './page-content-snapshot.js';

export class CmsPublishedPagesAdapter implements ICmsPublishedPagesPort {
  constructor(private readonly pages: Pick<IPagePublicationPort, 'versions'>,
    private readonly activation: Pick<IReleaseActivationPort, 'getActive'>,
    private readonly store: Pick<IPublicationStorePort, 'read'> & IPublicationArtifactSourcePort) {}

  async versions(siteId: string, pageId: string): ReturnType<ICmsPublishedPagesPort['versions']> {
    const pages = await this.pages.versions(siteId, pageId);

    return pages.map((page) => {
      if (page.siteId !== siteId || page.pageId !== pageId) {
        throw new Error('Foreign page version');
      }

      return { pageVersionId: pageVersionId(page), page };
    });
  }

  async readRelease(siteId: string, pageId: string, selected?: string):
  ReturnType<ICmsPublishedPagesPort['readRelease']> {
    const releaseId = selected ?? (await this.activation.getActive(siteId))?.releaseId;

    if (!releaseId) {
      return null;
    }

    const release = await this.store.read(siteId, releaseId, true);

    if (
      release?.siteId !== siteId
      || release.releaseId !== releaseId
      || release.state !== ReleaseState.Ready
      || !release.manifest?.routes.some((route) => route.kind !== PublishedRouteKind.Redirect
        && route.pageId === pageId)
    ) {
      return null;
    }

    const file = (await this.store.readArtifacts(siteId, releaseId, [pageSnapshotPath(pageId)])).find((file) =>
      file.path === pageSnapshotPath(pageId));

    if (!file || file.public) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'This release has no complete page snapshot; republish it');
    }

    const chunks: Uint8Array[] = [];

    for await (const chunk of file.content.bytes) {
      chunks.push(chunk);
    }

    return decodePageSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')), siteId, pageId);
  }
}
