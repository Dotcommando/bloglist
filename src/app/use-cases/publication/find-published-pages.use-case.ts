import { PublicationConsistencyError } from '../../../domain/publication/published-document.js';
import { requireCondition, requireText } from '../../../domain/shared/validation.js';
import type {
  IFindPublishedPages, IFindPublishedPagesInput,
} from '../../../ports/inbound/publication/find-published-pages.port.js';
import type { IPublishedPageCatalogPort } from '../../../ports/outbound/publication/published-page-catalog.port.js';
import type { IReleaseActivationPort } from '../../../ports/outbound/publication/release-activation.port.js';

export class FindPublishedPagesUseCase implements IFindPublishedPages {
  constructor(
    private readonly activation: IReleaseActivationPort, private readonly catalog: IPublishedPageCatalogPort,
  ) {}

  async execute(input: IFindPublishedPagesInput): Promise<readonly string[]> {
    requireText(input.siteId, 'siteId');
    requireCondition(Array.isArray(input.pageIds) && input.pageIds.length <= 128
      && input.pageIds.every((id) => typeof id === 'string' && id.trim().length > 0)
      && new Set(input.pageIds).size === input.pageIds.length, 'Invalid published page batch');

    if (!input.pageIds.length) {
      return [];
    }

    const active = await this.activation.getActive(input.siteId);

    if (!active) {
      return [];
    }
    if (active.siteId !== input.siteId) {
      throw new PublicationConsistencyError('Foreign active publication');
    }

    const pageIds = await this.catalog.readPublishedPageIds(input.siteId, active.releaseId);

    if (pageIds === null) {
      throw new PublicationConsistencyError('Active publication is unavailable');
    }

    const published = new Set(pageIds);

    return input.pageIds.filter((pageId) => published.has(pageId));
  }
}
