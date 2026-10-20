import type { Blog } from '../../../domain/creators/blog.js';

export interface IReassignBlogInput {
  blogId: string;
  bloggerId: string;
}

export interface IReassignBlog {
  execute(input: IReassignBlogInput): Promise<Blog>;
}
