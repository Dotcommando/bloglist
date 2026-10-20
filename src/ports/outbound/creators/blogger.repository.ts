import type { Blogger } from '../../../domain/creators/blogger.js';
import type { IBloggerFilter } from '../../../domain/creators/blogger-filter.js';

export interface IBloggerRepository {
  findById(bloggerId: string): Promise<Blogger | null>;
  findByMark(mark: string): Promise<Blogger | null>;
  findAll(filter?: IBloggerFilter): Promise<Blogger[]>;
  save(blogger: Blogger): Promise<Blogger>;
}
