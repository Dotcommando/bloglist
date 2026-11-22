export interface IImageSource {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
}

export interface IImageViewModel {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly sources: readonly IImageSource[];
}
