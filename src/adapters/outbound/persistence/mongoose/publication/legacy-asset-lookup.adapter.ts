import { ReleaseState } from '../../../../../domain/publication/publication-release.js';
import { PublicationConsistencyError } from '../../../../../domain/publication/published-document.js';
import type { ILegacyAssetLookupPort } from '../../../../../ports/outbound/publication/public-artifact.port.js';
import type { IPublicationModels } from './publication.models.js';

export class MongooseLegacyAssetLookupAdapter implements ILegacyAssetLookupPort {
  constructor(private readonly models: IPublicationModels) {}

  async findRelease(siteId: string, artifactPath: string): Promise<string | null> {
    const receipts = await this.models.activations.find({ siteId }).sort({ activatedAt: -1, _id: -1 }).lean().exec();

    for (const receipt of receipts) {
      if (receipt.siteId !== siteId) {
        throw new PublicationConsistencyError('Foreign activation receipt');
      }

      const release = await this.models.releases.findOne({
        _id: receipt._id,
        siteId,
        state: ReleaseState.Ready,
        'manifest.artifacts': { $elemMatch: { path: artifactPath, public: true } },
      }).select({ _id: 1 }).lean().exec();

      if (release) {
        return release._id;
      }
    }

    return null;
  }
}
