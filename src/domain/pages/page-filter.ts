import type { PageStatus } from './page-status.enum.js';
import type { PageType } from './page-type.enum.js';

export interface IPageFilter {
  clusterId?: string | null;
  language?: string;
  type?: PageType;
  status?: PageStatus;
}
