export interface IInspectJsonLdInput {
  readonly siteId: string;
  readonly pageId: string;
  readonly actorId?: string;
}

export interface IJsonLdInspection {
  readonly jsonLd: string | null;
  readonly warnings: readonly { readonly node: string; readonly property: string; readonly urlId: string }[];
}

export interface IInspectJsonLd {
  execute(input: IInspectJsonLdInput): Promise<IJsonLdInspection>;
}
