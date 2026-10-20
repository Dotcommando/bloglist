import type { Blogger } from '../../../domain/creators/blogger.js';

export interface IDeactivateBloggerInput {
  bloggerId: string;
}

export interface IDeactivateBlogger {
  execute(input: IDeactivateBloggerInput): Promise<Blogger>;
}
