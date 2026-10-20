import type { Blog } from '../../../domain/creators/blog.js';
import type { BlogPlatform } from '../../../domain/creators/blog-platform.enum.js';

export interface ICreateBlogInput {
  mark: string;
  bloggerId: string;
  platform: BlogPlatform;
  name: string;
  url: string;
  externalId?: string | null;
  handle?: string | null;
  description?: string | null;
}

export interface ICreateBlog {
  execute(input: ICreateBlogInput): Promise<Blog>;
}
