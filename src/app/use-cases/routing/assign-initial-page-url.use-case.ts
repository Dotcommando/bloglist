import { RoutingConflictError } from '../../../domain/routing/routing-conflict.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import type { Url } from '../../../domain/routing/url.js';
import type {
  IAssignInitialPageUrl,
  IAssignInitialPageUrlInput,
} from '../../../ports/inbound/routing/assign-initial-page-url.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';
import type { PageUrlPreparationService } from '../../services/routing/page-url-preparation.service.js';

export class AssignInitialPageUrlUseCase implements IAssignInitialPageUrl {
  constructor(
    private readonly urls: IUrlRepository,
    private readonly preparation: PageUrlPreparationService,
  ) {}

  async execute(input: IAssignInitialPageUrlInput): Promise<Url> {
    const url = await this.preparation.prepare(input);
    const current = await this.urls.findCurrentByPage(input.pageId);

    if (current && current.siteId !== input.siteId) {
      throw new RoutingScopeError('Current URL belongs to another site');
    }
    if (current) {
      throw new RoutingConflictError('Page already has a current URL');
    }

    return this.urls.save(url);
  }
}
