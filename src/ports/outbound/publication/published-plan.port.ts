import type { IStoredRequestPlan } from '../../../domain/publication/published-document.js';

export interface IPublishedPlanPort {
  readPlan(siteId: string, releaseId: string, planId: string): Promise<IStoredRequestPlan | null>;
}
