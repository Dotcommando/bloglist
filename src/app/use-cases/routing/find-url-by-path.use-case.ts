import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import type { Url } from '../../../domain/routing/url.js';
import type {
  IFindUrlByPath,
  IFindUrlByPathInput,
} from '../../../ports/inbound/routing/find-url-by-path.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';

export class FindUrlByPathUseCase implements IFindUrlByPath {
  constructor(private readonly urls: IUrlRepository) {}

  async execute(input: IFindUrlByPathInput): Promise<Url | null> {
    const url = await this.urls.findByPath(input.siteId, input.path);

    if (url && url.siteId !== input.siteId) {
      throw new RoutingScopeError('URL belongs to another site');
    }

    return url;
  }
}
