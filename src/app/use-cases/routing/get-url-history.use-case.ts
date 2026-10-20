import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import type { IUrlHistoryEntry } from '../../../domain/routing/url-history-entry.js';
import type {
  IGetUrlHistory,
  IGetUrlHistoryInput,
} from '../../../ports/inbound/routing/get-url-history.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';

export class GetUrlHistoryUseCase implements IGetUrlHistory {
  constructor(private readonly urls: IUrlRepository) {}

  async execute(input: IGetUrlHistoryInput): Promise<IUrlHistoryEntry[]> {
    const url = await this.urls.findById(input.urlId);

    if (!url) {
      throw new RoutingNotFoundError('URL was not found');
    }
    if (url.siteId !== input.siteId) {
      throw new RoutingScopeError('URL belongs to another site');
    }

    return structuredClone(await this.urls.getHistory(url.urlId));
  }
}
