import type { BloggerStatus } from './blogger-status.enum.js';
import type { BloggerType } from './blogger-type.enum.js';

export interface IBloggerFilter {
  status?: BloggerStatus;
  type?: BloggerType;
  country?: string;
}
