import type { Blog } from '../../../domain/creators/blog.js';

export interface IUpdateBlogStatsInput {
  blogId: string;
  followers: number;
  lastCheckedAt: Date;
}

export interface IUpdateBlogStats {
  execute(input: IUpdateBlogStatsInput): Promise<Blog>;
}
