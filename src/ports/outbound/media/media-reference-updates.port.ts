import type { IMediaPathReplacement } from '../../../domain/media/media-reference-rewrite.policy.js';

export type { IMediaPathReplacement } from '../../../domain/media/media-reference-rewrite.policy.js';

export interface IMediaReferenceUpdates {
  /** Update editable sources only, preserving their version guards and backups. */
  replace(siteId: string, paths: readonly IMediaPathReplacement[]): Promise<void>;
}
