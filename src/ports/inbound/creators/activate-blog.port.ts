import type { Blog } from '../../../domain/creators/blog.js';

export interface IActivateBlogInput {
  blogId: string;
}

export interface IActivateBlog {
  execute(input: IActivateBlogInput): Promise<Blog>;
}
