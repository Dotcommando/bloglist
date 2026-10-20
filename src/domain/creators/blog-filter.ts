import type { BlogPlatform } from './blog-platform.enum.js';
import type { BlogStatus } from './blog-status.enum.js';

export interface IBlogFilter {
  bloggerId?: string;
  platform?: BlogPlatform;
  status?: BlogStatus;
}
