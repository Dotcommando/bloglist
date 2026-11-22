import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface IPublicMediaContent {
  readonly content: IBinaryContent;
  readonly etag: string;
  dispose?(): Promise<void>;
}

export interface IReadPublicMedia {
  execute(input: { readonly hostname: string;
    readonly authority?: string;
    readonly path: string }): Promise<IPublicMediaContent | null>;
}
