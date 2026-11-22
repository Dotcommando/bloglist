import type { IPublishedArtifact } from '../../../domain/publication/published-artifact.js';
import { PublicationConsistencyError } from '../../../domain/publication/published-document.js';
import { requireAssetPath, requireText } from '../../../domain/shared/validation.js';
import type {
  IGetPublishedArtifact,
  IGetPublishedArtifactInput,
} from '../../../ports/inbound/publication/get-published-artifact.port.js';
import type {
  ILegacyAssetLookupPort,
  IPublicArtifactPort,
} from '../../../ports/outbound/publication/public-artifact.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';

export class GetPublishedArtifactUseCase implements IGetPublishedArtifact {
  constructor(private readonly content: IPublicArtifactPort, private readonly activation: IReleaseActivationPort,
    private readonly legacy: ILegacyAssetLookupPort) {}

  async execute(input: IGetPublishedArtifactInput): Promise<IPublishedArtifact | null> {
    requireText(input.siteId, 'siteId');
    requireAssetPath(input.path);

    if (input.releaseId === null && input.path !== 'sitemap.xml' && !input.path.startsWith('assets/')) {
      return null;
    }

    const active = input.releaseId === null && input.path === 'sitemap.xml'
      ? await this.activation.getActive(input.siteId) : null;

    if (active && active.siteId !== input.siteId) {
      throw new PublicationConsistencyError('Foreign active publication');
    }

    const releaseId = input.releaseId ?? (input.path === 'sitemap.xml'
      ? active?.releaseId : await this.legacy.findRelease(input.siteId, input.path));

    if (!releaseId) {
      return null;
    }
    requireText(releaseId, 'releaseId');
    const receipt = await this.activation.findActivation(input.siteId, releaseId);

    if (!receipt) {
      return null;
    }
    if (receipt.siteId !== input.siteId || receipt.releaseId !== releaseId) {
      throw new PublicationConsistencyError('Foreign activation receipt');
    }

    const file = input.metadataOnly
      ? await this.content.readPublicArtifact(input.siteId, releaseId, input.path, true)
      : await this.content.readPublicArtifact(input.siteId, releaseId, input.path);

    if (!file?.metadata.public) {
      return null;
    }
    if (
      file.siteId !== input.siteId
      || file.releaseId !== releaseId
      || file.metadata.path !== input.path
      || file.content.byteSize !== file.metadata.byteSize
      || file.content.mimeType !== file.metadata.mimeType
    ) {
      throw new PublicationConsistencyError('Inconsistent public artifact');
    }

    return file;
  }
}
