import type { Blog } from '../../../domain/creators/blog.js';

export interface IDeactivateBlogInput {
  blogId: string;
}

export interface IDeactivateBlog {
  execute(input: IDeactivateBlogInput): Promise<Blog>;
}
