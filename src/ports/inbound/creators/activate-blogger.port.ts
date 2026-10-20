import type { Blogger } from '../../../domain/creators/blogger.js';

export interface IActivateBloggerInput {
  bloggerId: string;
}

export interface IActivateBlogger {
  execute(input: IActivateBloggerInput): Promise<Blogger>;
}
