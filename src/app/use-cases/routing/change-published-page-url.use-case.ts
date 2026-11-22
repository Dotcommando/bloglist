import type { IPublishRoutingRelease } from '../../../ports/inbound/publication/publish-routing-release.port.js';
import type { IChangePageUrl, IChangePageUrlInput } from '../../../ports/inbound/routing/change-page-url.port.js';
import type {
  IChangedPublishedPageUrl, IChangePublishedPageUrl,
} from '../../../ports/inbound/routing/change-published-page-url.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';

export class ChangePublishedPageUrlUseCase implements IChangePublishedPageUrl {
  constructor(private readonly change: IChangePageUrl, private readonly publish: IPublishRoutingRelease,
    private readonly access: IPublicationAccessPort) {}

  async execute(input: IChangePageUrlInput & { actorId: string }): Promise<IChangedPublishedPageUrl> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const url = await this.change.execute(input);

    try {
      const publication = await this.publish.execute({ siteId: input.siteId, actorId: input.actorId });

      return { url, publication, publicationFailed: false };
    } catch {
      return { url, publication: null, publicationFailed: true };
    }
  }
}
