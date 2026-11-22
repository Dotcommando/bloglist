export interface IMarkdownConversionPort {
  toMarkdown(html: string): string;
}
