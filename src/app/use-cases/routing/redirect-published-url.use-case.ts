import type { IPublishRoutingRelease } from '../../../ports/inbound/publication/publish-routing-release.port.js';
import type {
  IRedirectedPublishedUrl, IRedirectPublishedUrl,
} from '../../../ports/inbound/routing/redirect-published-url.port.js';
import type { IRedirectUrl, IRedirectUrlInput } from '../../../ports/inbound/routing/redirect-url.port.js';
import type { IPublicationAccessPort } from '../../../ports/outbound/publication/publication-access.port.js';

export class RedirectPublishedUrlUseCase implements IRedirectPublishedUrl {
  constructor(private readonly redirect: IRedirectUrl, private readonly publish: IPublishRoutingRelease,
    private readonly access: IPublicationAccessPort) {}

  async execute(input: IRedirectUrlInput): Promise<IRedirectedPublishedUrl> {
    await this.access.assertEditor(input.siteId, input.actorId);
    const url = await this.redirect.execute(input);

    try {
      const publication = await this.publish.execute({ siteId: input.siteId, actorId: input.actorId });

      return { url, publication, publicationFailed: false };
    } catch {
      return { url, publication: null, publicationFailed: true };
    }
  }
}
