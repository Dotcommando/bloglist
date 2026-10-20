import type { Blog } from '../../../domain/creators/blog.js';

export interface IGetBlogInput {
  blogId: string;
}

export interface IGetBlog {
  execute(input: IGetBlogInput): Promise<Blog | null>;
}
