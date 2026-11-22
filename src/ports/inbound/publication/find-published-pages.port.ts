export interface IFindPublishedPagesInput {
  readonly siteId: string;
  readonly pageIds: readonly string[];
}

/** Published membership in one captured active release; never draft existence. */
export interface IFindPublishedPages {
  execute(input: IFindPublishedPagesInput): Promise<readonly string[]>;
}
