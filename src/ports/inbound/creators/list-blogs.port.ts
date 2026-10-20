import type { Blog } from '../../../domain/creators/blog.js';
import type { IBlogFilter } from '../../../domain/creators/blog-filter.js';

export interface IListBlogsInput {
  filter?: IBlogFilter;
}

export interface IListBlogs {
  execute(input: IListBlogsInput): Promise<Blog[]>;
}
