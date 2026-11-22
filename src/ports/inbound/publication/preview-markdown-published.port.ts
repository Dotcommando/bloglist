export interface IPreviewMarkdownPublishedInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly pageId: string;
}

export interface IPreviewMarkdownPublished {
  execute(input: IPreviewMarkdownPublishedInput): Promise<{ readonly markdown: string }>;
}
