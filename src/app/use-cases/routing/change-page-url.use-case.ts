import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { Url } from '../../../domain/routing/url.js';
import { UrlKind } from '../../../domain/routing/url-kind.enum.js';
import type {
  IChangePageUrl,
  IChangePageUrlInput,
} from '../../../ports/inbound/routing/change-page-url.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';
import type { PageUrlPreparationService } from '../../services/routing/page-url-preparation.service.js';

export class ChangePageUrlUseCase implements IChangePageUrl {
  constructor(
    private readonly urls: IUrlRepository,
    private readonly preparation: PageUrlPreparationService,
  ) {}

  async execute(input: IChangePageUrlInput): Promise<Url> {
    const newUrl = await this.preparation.prepare(input);
    const previous = await this.urls.findCurrentByPage(input.pageId);

    if (!previous) {
      throw new RoutingNotFoundError('Current page URL was not found');
    }
    if (previous.siteId !== input.siteId) {
      throw new RoutingScopeError('Current URL belongs to another site');
    }
    if (previous.kind !== UrlKind.PAGE || previous.pageId !== input.pageId) {
      throw new RangeError('Expected the current PAGE URL for the requested page');
    }

    const expected = previous.toState();
    const redirect = new Url(expected);

    redirect.redirectTo(newUrl.urlId, input.redirectStatus);
    await this.urls.changePageUrl({
      previousUrl: expected,
      newUrl,
      redirectStatus: input.redirectStatus,
      changedAt: newUrl.firstPublishedAt,
    });

    return newUrl;
  }
}
