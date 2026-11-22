import type { IPublishedRouting } from '../../../domain/publication/published-routing.js';

export interface IPublishedRoutingPort {
  readActive(siteId: string): Promise<IPublishedRouting | null>;
}
