export enum TvKind { Text = 'Text', Markdown = 'Markdown', Image = 'Image', File = 'File' }

export enum TvImageMode { Single = 'Single', Responsive = 'Responsive' }

export type TvValue = string | null | { kind: TvKind.Markdown; text: string }
  | { kind: TvKind.Image; fileId: string; mode: TvImageMode; key?: string; alt: string }
  | { kind: TvKind.File; fileId: string; label: string };

export interface ITvField {
  name: string;
  caption: string;
  description: string;
  kind: TvKind;
  templateIds: string[];
  required: boolean;
  sortOrder: number;
  defaultValue?: TvValue;
}

export interface ITvCatalog { siteId: string; version: string; fields: ITvField[]; }

export interface ITvDetails {
  catalog: ITvCatalog;
  values: Record<string, TvValue>;
  templateId: string | null;
  updatedAt: string;
  mediaVersion: string;
}

export function isEmptyTvValue(value: TvValue | undefined): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.length === 0;
  }

  return value.kind === TvKind.Markdown ? value.text.length === 0 : value.fileId.length === 0;
}

export function parseTvValue(value: unknown): TvValue {
  if (value === null || typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object' || !('kind' in value)) {
    throw new Error('Invalid TV value');
  }
  if (value.kind === TvKind.Markdown && 'text' in value && typeof value.text === 'string') {
    return { kind: TvKind.Markdown, text: value.text };
  }
  if (!('fileId' in value) || typeof value.fileId !== 'string') {
    throw new Error('Invalid TV reference');
  }
  if (value.kind === TvKind.File && 'label' in value && typeof value.label === 'string') {
    return { kind: TvKind.File, fileId: value.fileId, label: value.label };
  }
  if (value.kind === TvKind.Image && 'alt' in value && typeof value.alt === 'string' && 'mode' in value) {
    if (value.mode === TvImageMode.Responsive) {
      return { kind: TvKind.Image, fileId: value.fileId, alt: value.alt, mode: TvImageMode.Responsive };
    }
    if (value.mode === TvImageMode.Single && 'key' in value && typeof value.key === 'string') {
      return { kind: TvKind.Image, fileId: value.fileId, alt: value.alt, mode: TvImageMode.Single, key: value.key };
    }
  }
  throw new Error('Invalid TV binding');
}

export function parseTvValues(value: unknown): Record<string, TvValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid TV values');
  }

  return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, parseTvValue(value)]));
}
