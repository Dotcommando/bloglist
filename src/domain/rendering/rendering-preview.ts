export interface IRenderingPreviewDocument {
  readonly mimeType?: string;
  readonly siteId: string;
  readonly pageId: string;
  readonly html: string;
}
