import { RoutingNotFoundError } from '../../../domain/routing/routing-not-found.error.js';
import { RoutingScopeError } from '../../../domain/routing/routing-scope.error.js';
import { validateUrlHistory } from '../../../domain/routing/url-history.policy.js';
import type { IUrlHistoryEntry } from '../../../domain/routing/url-history-entry.js';
import { requireText } from '../../../domain/shared/validation.js';
import type { IGetUrlHistory, IGetUrlHistoryInput } from '../../../ports/inbound/routing/get-url-history.port.js';
import type { IRoutingAccessPort } from '../../../ports/outbound/routing/routing-access.port.js';
import type { IUrlRepository } from '../../../ports/outbound/routing/url.repository.js';

export class GetUrlHistoryUseCase implements IGetUrlHistory {
  constructor(private readonly urls: IUrlRepository, private readonly access: IRoutingAccessPort) {}

  async execute(input: IGetUrlHistoryInput): Promise<IUrlHistoryEntry[]> {
    await this.access.assertCanReadRouting(input.siteId);
    requireText(input.siteId, 'siteId');
    requireText(input.urlId, 'urlId');
    const url = await this.urls.findById(input.urlId);

    if (!url) {
      throw new RoutingNotFoundError('URL not found');
    }
    if (url.urlId !== input.urlId || url.siteId !== input.siteId) {
      throw new RoutingScopeError('URL identity or site does not match');
    }

    const history = await this.urls.getHistory(input.urlId);
    const identities = new Set<string>();

    for (const entry of history) {
      validateUrlHistory(entry);

      if (entry.urlId !== input.urlId || identities.has(entry.urlHistoryEntryId)) {
        throw new RoutingScopeError('Inconsistent URL history');
      }
      identities.add(entry.urlHistoryEntryId);
    }

    return history.map((entry) => ({ ...entry, createdAt: new Date(entry.createdAt) }))
      .sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime()
        || (first.urlHistoryEntryId < second.urlHistoryEntryId ? -1 : first.urlHistoryEntryId > second.urlHistoryEntryId
          ? 1 : 0));
  }
}
