import type { Blogger } from '../../../domain/creators/blogger.js';
import type { BloggerType } from '../../../domain/creators/blogger-type.enum.js';

export interface ICreateBloggerInput {
  mark: string;
  name: string;
  type?: BloggerType;
  country?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  notesMd?: string | null;
}

export interface ICreateBlogger {
  execute(input: ICreateBloggerInput): Promise<Blogger>;
}
