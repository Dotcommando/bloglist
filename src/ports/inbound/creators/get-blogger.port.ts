import type { Blogger } from '../../../domain/creators/blogger.js';

export interface IGetBloggerInput {
  bloggerId: string;
}

export interface IGetBlogger {
  execute(input: IGetBloggerInput): Promise<Blogger | null>;
}
