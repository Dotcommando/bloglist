export interface ICursorInput {
  readonly limit: number;
  readonly cursor: string | null;
}

export interface ICursorPage<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor: string | null;
}
