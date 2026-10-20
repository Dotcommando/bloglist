import type { Blog } from '../../../domain/creators/blog.js';

export interface IUpdateBlogInput {
  blogId: string;
  name?: string;
  url?: string;
  handle?: string | null;
  description?: string | null;
}

export interface IUpdateBlog {
  execute(input: IUpdateBlogInput): Promise<Blog>;
}
