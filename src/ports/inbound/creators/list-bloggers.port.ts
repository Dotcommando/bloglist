import type { Blogger } from '../../../domain/creators/blogger.js';
import type { IBloggerFilter } from '../../../domain/creators/blogger-filter.js';

export interface IListBloggersInput {
  filter?: IBloggerFilter;
}

export interface IListBloggers {
  execute(input: IListBloggersInput): Promise<Blogger[]>;
}
