export interface IRepublishSnippetPages {
  execute(input: { readonly siteId: string; readonly key: string }): Promise<void>;
}
