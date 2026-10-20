import type { Blog } from '../../../domain/creators/blog.js';
import type { IBlogFilter } from '../../../domain/creators/blog-filter.js';
import type { BlogPlatform } from '../../../domain/creators/blog-platform.enum.js';

export interface IBlogRepository {
  findById(blogId: string): Promise<Blog | null>;
  findByMark(mark: string): Promise<Blog | null>;
  findByUrl(url: string): Promise<Blog | null>;
  findByExternalId(platform: BlogPlatform, externalId: string): Promise<Blog | null>;
  findByBlogger(bloggerId: string): Promise<Blog[]>;
  findAll(filter?: IBlogFilter): Promise<Blog[]>;
  save(blog: Blog): Promise<Blog>;
}
