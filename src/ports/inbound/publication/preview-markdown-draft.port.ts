export interface IPreviewMarkdownDraftInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly pageId: string;
}

export interface IPreviewMarkdownDraft {
  execute(input: IPreviewMarkdownDraftInput): Promise<{ readonly markdown: string }>;
}
