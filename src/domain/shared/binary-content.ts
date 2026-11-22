export interface IBinaryContent {
  readonly bytes: AsyncIterable<Uint8Array>;
  readonly byteSize: number;
  readonly mimeType: string;
}

export interface IContentReference {
  readonly contentId: string;
}
