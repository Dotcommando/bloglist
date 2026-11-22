import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { Url } from '../../../domain/routing/url.js';
import { requireUrlPath } from '../../../domain/routing/url-path.policy.js';
import { requireText } from '../../../domain/shared/validation.js';
import type { IFindUrlByPath, IFindUrlByPathInput } from '../../../ports/inbound/routing/find-url-by-path.port.js';
import type { IRoutingAccessPort } from '../../../ports/outbound/routing/routing-access.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';

export class FindUrlByPathUseCase implements IFindUrlByPath {
  constructor(private readonly urls: IUrlRepository, private readonly access: IRoutingAccessPort) {}

  async execute(input: IFindUrlByPathInput): Promise<Url | null> {
    await this.access.assertCanReadRouting(input.siteId);
    requireText(input.siteId, 'siteId');
    requireUrlPath(input.path);
    const url = await this.urls.findByPath(input.siteId, input.path);

    if (url && (url.siteId !== input.siteId || url.path !== input.path)) {
      throw new RoutingScopeError('URL site or path does not match');
    }

    return url ? new Url(url.toState()) : null;
  }
}
