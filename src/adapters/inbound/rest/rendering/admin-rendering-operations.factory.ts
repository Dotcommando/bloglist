import type { IRenderingPreviewDocument } from '../../../../domain/rendering/rendering-preview.js';
import type { IRenderingOperations } from '../../../../ports/inbound/rendering/rendering-elements.port.js';

export interface IAdminRenderingOperations extends IRenderingOperations {
  readonly inspectJsonLdDraft: {
    execute(input: { siteId: string; pageId: string }): Promise<{
      jsonLd: string | null;
      warnings: readonly unknown[];
    }>;
  };
  readonly inspectJsonLdPublished: {
    execute(input: { siteId: string; pageId: string }): Promise<{
      jsonLd: string | null;
      warnings: readonly unknown[];
    }>;
  };
  readonly previewMarkdownPublished: {
    execute(input: { siteId: string; pageId: string }): Promise<{ markdown: string }>;
  };
  readonly previewMarkdownDraft: { execute(input: { siteId: string; pageId: string }): Promise<{ markdown: string }> };
  readonly readPreview: { execute(previewId: string): Promise<IRenderingPreviewDocument> };
}

export interface IAdminRenderingOperationFactory {
  forSession(token: string | null): IAdminRenderingOperations;
}
