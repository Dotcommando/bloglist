import type { IMediaPathReplacement } from '../../../domain/media/media-reference-rewrite.policy.js';

export interface IRewritePageMediaReferences {
  execute(input: { readonly siteId: string;
    readonly pageId: string;
    readonly paths: readonly IMediaPathReplacement[] }): Promise<void>;
}
